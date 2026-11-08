---
layout: post
title: "Adding Optional OIDC Login to qcontroller: How Single Sign-On Actually Works"
description: "qcontroller can now sit behind your company's single sign-on. Turning it on is a config block; understanding what happens when you click 'Sign in' takes a short trip to a nightclub with a very careful bouncer."
date: 2026-11-08
categories:
- devops
- security
tags:
- oidc
- authentication
- go
- keycloak
- infrastructure
---
{% assign intro = site.posts | where: "title", "Introducing qcontroller: Declarative VM Management with QEMU and Go" | first %}
{% assign frontend = site.posts | where: "title", "From Swagger UI to React: Building qcontroller's Frontend" | first %}
{% assign keycloak = site.posts | where: "title", "Solving Keycloak Internal vs External Access in Kubernetes with hostname-backchannel-dynamic" | first %}

For a long time [qcontroller](https://github.com/q-controller/qcontroller) had no idea who was talking to it. That was fine while it ran on my laptop and the only client was me. It stopped being fine the moment the orchestrator moved to a shared machine, the {% if frontend %}[web UI]({{ frontend.url }}){% else %}web UI{% endif %} became reachable from the office network, and a CI job needed to create VMs on its own.

The usual answer to "who is this" in infrastructure is single sign-on through OpenID Connect (OIDC): let the identity provider you already have - Keycloak, Okta, Dex, Google - do the login, and have your service trust the result. qcontroller now supports exactly that. It is optional: no `auth` block in the config, no authentication, same behaviour as before.

Turning it on is a few lines of JSON. But I also wanted to understand the flow well enough to explain it without hand-waving, because most explanations I found either stop at "it's like OAuth2 but for identity" or dive straight into token formats. So this post does both: it shows how to enable login in qcontroller, and it walks through what OIDC actually does, using a picture that helped me keep the pieces apart.

## A club, a bouncer, and a passport office

Imagine a club. The bouncer at the door does not keep a list of everyone in town. Instead, there is a passport office across the street, and the bouncer trusts it.

**You arrive without anything.** The bouncer writes a random number on your hand, notes the same number in a notebook only he can read, and sends you across the street. That number is the OIDC `state`. It ties your return to the visit you started.

**You show your papers at the office**, not to the bouncer. The office knows you. It hands you a sealed slip with a one-time number and sends you back. The slip is the *authorization code*. On its own it is worthless: it only means something to the club, and only once.

**Back at the door**, the bouncer checks the number on your hand against the notebook. If it does not match, you are turned away, even with a slip in your hand. Then he phones the office, reads out the slip number together with the club's secret, and the office reads back a stamped ID card. This phone call is the *token exchange*. It goes from server to server; the card never travels through your browser. The card is the *ID token*.

**How does the bouncer know the card is real?** Every morning he picks up the office's sheet of stamp patterns, the public keys it publishes. He holds the card under a loupe and compares the stamp. A match proves the office made it and nobody changed it since. Then he reads the card: issued by the office he expects, made out to this club and not some other club, not yet expired. That is signature, issuer, audience and expiry verification.

**Then you get a wristband.** The bouncer copies your name off the card onto a wristband and seals it with the club's own seal. Until the card expires, the wristband is all he looks at - the office is not phoned on every visit. The wristband is qcontroller's session cookie, and the seal is an HMAC with a key only the server has.

**Some guests skip all of this.** A CI job arrives already holding an ID card the office gave it directly. It shows the card at the door on every visit, the bouncer checks the stamp each time, and that is it. No slip, no phone call, no wristband. That is a bearer token.

**Leaving.** The bouncer cuts the wristband off. He also hands you the address of the office's exit desk with your card number on it, so the office forgets your visit too. Otherwise the next "Sign in" would skip the password, because the office still remembers you. That is RP-initiated logout, and it has to be the browser that walks over there, because the office's memory of you lives in a cookie on the office's domain.

If you keep three things apart - the slip, the card, the wristband - the rest of OIDC is detail.

## What that looks like in qcontroller

| In the story | In OIDC | In qcontroller |
|---|---|---|
| Passport office | Identity provider (issuer) | An entry in `auth.issuers` |
| Sheet of stamp patterns | JWKS, found via `.well-known/openid-configuration` | Discovery at startup; keys fetched on first use and again when they rotate |
| Number on the hand + notebook | `state` parameter | Query parameter matched against a 10-minute signed cookie (the bouncer's notebook), scoped to the callback URL |
| Sealed slip | Authorization code | `code` query parameter on `/v1/auth/callback` |
| Phone call | Token exchange | Server-side, with `client_secret` |
| Stamped ID card | ID token (a JWT) | Verified, then the claims become an identity |
| Wristband | Session | Signed, HttpOnly cookie, 8 hours by default, renewed on use |
| Guest with their own card | Bearer token | `Authorization: Bearer <id token>` |
| Exit desk | `end_session_endpoint` | Returned by `POST /v1/auth/logout`, the UI redirects there |

The identity that comes out of this - subject, email, name, groups, and which issuer vouched for it - travels with the request. Every log line written while handling it carries the user, and when the orchestrator calls a node over gRPC, the identity rides along in the metadata so the node's logs say who asked.

## Turning it on

```json
"auth": {
    "external_url": "https://qcontroller.example.com",
    "issuers": [
        {
            "name": "keycloak",
            "display_name": "Company SSO",
            "issuer_url": "https://sso.example.com/realms/main",
            "client_id": "qcontroller",
            "client_secret": "..."
        },
        {
            "name": "github-actions",
            "issuer_url": "https://token.actions.githubusercontent.com",
            "audience": "qcontroller"
        }
    ]
}
```

Two kinds of issuer live in that list, and the difference is one field. An issuer **with a `client_id`** is a passport office the bouncer can send people to: it appears as a button on the login page. An issuer **without one** is bearer-only: qcontroller trusts the cards it issues, but nobody can be sent there from the browser. That is the CI case. GitHub Actions, GitLab and most cloud platforms can mint an OIDC token for a running job; you set the `audience` to what you configured here, pass the token in the `Authorization` header, and the job is a known user without any shared secret.

Every issuer needs either an `audience` or a `client_id`. The ID card must be made out to *this* club; a token the provider issued for some other application is rejected.

Two URLs have to be registered at the provider, because the office only sends people back to addresses it knows:

- Redirect URI: `<external_url>/v1/auth/callback`
- Post-logout redirect URI: `<external_url>/ui/`

The key for sealing wristbands is generated on first start and stored next to the config as `session.key`. There is no server-side session store: the cookie is the session, so any replica with the same key can check it.

## Trying it without a real provider

For development I use [mock-oauth2-server](https://github.com/navikt/mock-oauth2-server). It accepts any username and issues valid tokens:

```shell
docker run -d --name qc-fake-oidc -p 9090:9090 -e SERVER_PORT=9090 \
    ghcr.io/navikt/mock-oauth2-server:latest
```

`start.sh --auth` reads the issuer from environment variables and writes the `auth` block for you:

```shell
OIDC_ISSUER_URL=http://localhost:9090/default \
OIDC_CLIENT_ID=qcontroller \
OIDC_CLIENT_SECRET=anything \
OIDC_PROVIDER_NAME=fake \
./start.sh --auth --rundir ./build/run --bin ./build/qcontrollerd
```

Open the UI, click the one provider button, type any name, and you are back in qcontroller with a session. Clear the cookie and watch the network tab while you log in again - you will see the three steps from the story: the redirect out, the redirect back with `code` and `state`, and the `Set-Cookie` on the callback.

If you run a real Keycloak inside Kubernetes, {% if keycloak %}[this earlier note]({{ keycloak.url }}){% else %}my earlier note on Keycloak's backchannel hostname{% endif %} covers the one configuration problem you are likely to hit.

## Things worth knowing

**The provider must be reachable at startup.** qcontroller fetches the discovery document for every issuer when it boots. If the office is closed that morning, the club does not open. I prefer failing early over discovering the problem on the first login, but it does mean your IdP is part of the startup path.

**Session length is a sliding window.** Every request renews the cookie, so an active user stays logged in. If the provider hands out a refresh token, qcontroller uses it to fetch a new ID token when the old one expires, which is also how group changes reach a running session. Many providers only issue refresh tokens when asked for `offline_access`; without one, the identity is as fresh as the login.

**The wristband is sealed, not locked.** The cookie is signed, so it cannot be forged or altered, but what is written on it is readable. It is `HttpOnly`, so page scripts never see it, and `Secure` whenever `external_url` is HTTPS. Encrypting the payload is on my list.

**Bearer tokens skip the CSRF check.** Mutating requests from the browser must carry an `X-Requested-With` header, which cross-origin pages cannot set. A request authenticated with a bearer header is exempt, because a CI job cannot be tricked by a malicious web page the way a browser can.

---

Single sign-on sounds heavy, and the specifications do not help with that impression. But the protocol itself is a short story: go across the street, come back with a slip, let the server trade the slip for a card, check the stamp, hand out a wristband. qcontroller now does that dance when you ask it to, and ignores the whole subject when you do not. The implementation, together with the README section on configuring it, is in [PR #57](https://github.com/q-controller/qcontroller/pull/57). I tried to lay out `src/pkg/auth` so that each file is one step of the story.
