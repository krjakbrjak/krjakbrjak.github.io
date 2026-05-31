---
layout: post
title: "Bootstrapping Kubernetes Before the Registry Exists - Pre-Tagging Images for containerd"
description: "Bootstrap a Kubernetes cluster before the private registry exists. Pre-tag side-loaded container images with the future registry path so Helm values, containerd cache, and kubelet pulls all reference the same string."
date: 2026-05-31
categories:
- devops
- kubernetes
tags:
- devops
- kubernetes
- bootstrap
- helm
- containerd
---

If you're setting up Kubernetes for a private project — internal tools, an isolated network, an in-house stack — at some point you hit the question: where do the images come from?

Every tutorial assumes public registries like `docker.io`, `ghcr.io`, or `quay.io` are reachable. When they aren't, the chicken-and-egg starts. You can't pull your registry image from your registry. You can't authenticate against your IdP before the IdP is up. Each foundation service has the same shape.

There isn't much written about how to actually bootstrap from this state. Here's the approach I've been using.

## Foundation services all have the same problem

The same pattern shows up everywhere:

- **Registry**: kubelet needs to pull the registry image from somewhere, but the registry is what would serve it.
- **Identity provider**: anything that does OIDC depends on the IdP being up — and the IdP pod doesn't start without an image pull either.

If you treat each one as a special case, you end up with a pile of "first time only" scripts that drift out of sync with your normal deploy path.

## A workable approach

The mechanic itself is plain:

1. Build the image with `docker build`.
2. Save it to a tarball with `docker save`.
3. Copy the tarball to every Kubernetes node.
4. Import it into containerd with `ctr -n k8s.io images import <tar>`.

With `imagePullPolicy: IfNotPresent` set on the pod spec, kubelet uses the cached image and doesn't try to pull. The registry doesn't have to be up. Nothing has to be reachable.

None of these steps are exotic. What matters is step 2 — specifically, which name you tag the image with before saving.

## The naming has to line up

When you import an image into containerd, it ends up in the cache under whatever name the tarball says. That name is just a string. There's nothing special about `repo/registry:latest` vs `registry.example.com/repo/registry:latest` — both are valid, either can live in the cache, neither requires the registry hostname to resolve.

So the question is: which name?

The easy answer is the bare name that matches the chart defaults:

```yaml
# values.yaml
image:
  repository: repo/registry
  tag: latest
  pullPolicy: IfNotPresent
```

```bash
docker build -t repo/registry:latest .
docker save repo/registry:latest > registry.tar
scp registry.tar node:/tmp/
ssh node 'sudo ctr -n k8s.io images import /tmp/registry.tar'
```

It works on day 1. But once the registry is up and you start pushing real builds like `registry.example.com/repo/registry:v0.4.2`, every chart needs its `image.repository` flipped to the fully-qualified path. Multiple charts, multiple environments, multiple overlays. Day-1 and day-2 deploys end up as different code paths.

The fix is to make the name you import under match the name your chart references and the name kubelet would dial out for. Three things, one string. Use the fully-qualified registry path from day 1:

```bash
docker build -t registry.example.com/repo/registry:v0.4.2 .
docker save registry.example.com/repo/registry:v0.4.2 > registry.tar
scp registry.tar node:/tmp/
ssh node 'sudo ctr -n k8s.io images import /tmp/registry.tar'
```

```yaml
image:
  repository: registry.example.com/repo/registry
  tag: v0.4.2
  pullPolicy: IfNotPresent
```

Now containerd's cache key, the chart's `image.repository`, and the hostname kubelet would query on a cache miss are all the same string. The cluster can't tell whether the image came from a side-load yesterday or a registry pull this morning.

> **One caveat about the tag itself**: use an immutable tag like `v0.4.2`, not `latest`. With `IfNotPresent`, kubelet keeps any image already in the cache and never re-pulls it — so a side-loaded `latest` stays frozen at the bootstrap build even after the registry is serving a newer `latest`. An immutable tag sidesteps this: the bootstrap nodes hold `v0.4.2` forever (correctly), and the next release ships as `v0.4.3`, which those nodes have never seen and therefore pull normally once the registry is up.

## What this gives you

**Every foundation service bootstraps the same way.** Registry, IdP — same mechanic, same naming pattern, no special cases. The bootstrap script becomes a loop over a list of images.

**Helm values are written once.** No bootstrap-mode overlays versus production-mode overlays. No `image.repository` migration to track later. The values file you ship is the values file that stays correct.

**Argo CD inherits the cluster cleanly.** When you move to GitOps, Argo CD reads the same Helm charts. The image strings are unchanged — the side-loaded tags are already cached, and every new release bumps to a tag the nodes haven't seen, so kubelet pulls it from the registry normally. No migration, no first-sync mode, no `Application` that has to know about the bootstrap path. Day-1 and day-2 are the same code path because the names line up.

## Conclusion

The mechanic isn't the point. `docker save` and `ctr import` are not clever. What matters is the alignment: the name in containerd, the name in the chart, and the name kubelet would dial out for — all the same string from the first import.

When they line up, the chicken-and-egg stops feeling like a problem.
