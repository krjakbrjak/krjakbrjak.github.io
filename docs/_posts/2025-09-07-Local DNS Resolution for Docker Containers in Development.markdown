---
layout: post
title:  "Local DNS Resolution for Docker Containers in Development"
date:   2025-08-05
categories:
- devops
- containers
- networking
tags:
- go
- devops
- infrastructure
- dns
- docker
---

## The challenge: service discovery in containers

In modern backend development, most systems run in isolated environments—most commonly, containers. A typical backend consists of several services that need to communicate with each other. Orchestrators like Kubernetes and Docker Compose provide internal DNS so services can reach each other by hostname. It’s convenient and often feels like magic.

## Why internal DNS isn’t enough (the “public URL” problem)

What if you need to access your service via a public URL? Imagine a reverse proxy fronting everything, with Keycloak behind it and an oauth2-proxy handling authentication via Keycloak. oauth2-proxy needs:

1. `--redirect-url` — the URL the browser hits
2. `--oidc-issuer-url` — the URL the proxy uses to obtain tokens

To avoid CSRF issues you also set `--cookie-secure=true`. Because clients reach Keycloak **through** the reverse proxy, the redirect URL must point to the proxy; the issuer URL should also point to Keycloak. You __could__ use an internal DNS name for the issuer URL, but that breaks CSRF checks—**both URLs must share the same hostname**, which is typically a public domain you don’t have in local dev. Dilemma.

## Why mismatched hostnames trigger “CSRF” errors

During the OAuth/OIDC flow your proxy sets a short-lived value (state/nonce) in a cookie on the exact host the user is visiting (e.g. `auth.local.test`). When Keycloak redirects back, the proxy must compare the state in the callback URL with the copy stored in that cookie. That comparison is the CSRF defence.
If you mix hosts—say the browser hits `https://auth.local.test` but your issuer is `http://keycloak:8080`—the browser won’t send the cookie to the other host. Different host => different cookie scope. On top of that, `--cookie-secure=true` means the cookie is only sent over HTTPS, so any HTTP hop drops it. Modern SameSite rules also treat different hosts as “cross-site”, which further blocks the cookie from riding along. The proxy can’t find the cookie it set, the state check fails, and you get a CSRF error.

This is why resolving the “public” name to your container locally is so effective: every step sees the same host, so the browser sends the right cookie and the CSRF check passes.

## Existing Solutions

At this point, you either fake domains in `/etc/hosts` or look for a tool that maps container names to hostnames. I started with the smart [devdns](https://github.com/ruudud/devdns) project and even [tried automating](https://github.com/krjakbrjak/name_resolver/tree/f92d96ada706d4d760693dc8adfb0f4f9656f0ec) hosts-file updates on Docker start/stop. It worked, but hosts files are brittle and easily clobbered. I wanted something that behaves like real DNS without hand-editing files.

## A Better Approach: Local DNS Server for Containers

Run a local DNS server that watches running containers. If a query matches a container’s name (or alias), answer with the container’s IP. Otherwise, forward to your normal upstreams (Google, Cloudflare, etc.). Docker’s APIs are great in Go, and [miekg/dns](https://github.com/miekg/dns) makes DNS straightforward, so I built a tiny server in Go. You can find the code [here](https://github.com/krjakbrjak/name_resolver).

### How it works (at a glance)
* Browser asks DNS for **example.com**.
* Local resolver checks if a container named/aliased **example.com** is running.
* If yes → return the container’s IP. If no → forward to public DNS and return that IP.

<p align="center">
  <img src="/images/posts/Local DNS Resolution for Docker Containers in Development/flow.svg" alt="Local DNS Container Name Resolution Flow"/>
</p>

## How to Use the Local DNS Server
When you run the DNS server locally (for example, on port `53`), it will resolve container names to their IP addresses automatically. Here’s a simple example using Docker Compose:

```yaml
services:
  ubuntu:
    image: ubuntu:latest
    container_name: github.com
    command: ["sleep", "infinity"]
```

After starting this Compose file, any DNS query for `github.com` will resolve to the IP address of the `ubuntu` container. For instance, running `dig github.com` will return:

```shell
; <<>> DiG 9.20.4-3ubuntu1.2-Ubuntu <<>> github.com
;; global options: +cmd
;; Got answer:
;; ->>HEADER<<- opcode: QUERY, status: NOERROR, id: 44158
;; flags: qr rd ra; QUERY: 1, ANSWER: 1, AUTHORITY: 0, ADDITIONAL: 1

;; OPT PSEUDOSECTION:
; EDNS: version: 0, flags:; udp: 65494
;; QUESTION SECTION:
;github.com.                    IN      A

;; ANSWER SECTION:
github.com.             0       IN      A       172.21.0.2

;; Query time: 2 msec
;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)
;; WHEN: Sun Sep 07 19:24:24 CEST 2025
;; MSG SIZE  rcvd: 55
```

Notice that the IP address in the answer section matches the container’s IP. You can verify this with:

```shell
{% raw %}docker compose -f /tmp/docker-compose.yml ps -q ubuntu | xargs docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}'{% endraw %}
172.21.0.2
```

## Configuring Your System to Use the DNS Server

> Note: To use this DNS server, configure your system to point to it. For example, if using `systemd-resolved`:
```shell
sudo resolvectl dns <INTERFACE> 127.0.0.1:5300
```
> This change is temporary and will reset on reboot. To revert manually:
```shell
sudo systemctl restart systemd-resolved
```

## Conclusion

Local dev often breaks when parts of your stack see different hostnames. A tiny local DNS server fixes that: resolve container names to their IPs, forward everything else upstream, and your dev environment starts behaving like production without hacks.

### Why this helps you

* One hostname end-to-end → fewer auth/cookie surprises.
* No manual hosts edits
* Works with Compose out of the box; trivial to verify with dig.
