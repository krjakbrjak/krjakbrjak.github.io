---
layout: post
title: "Solving Keycloak Internal vs External Access in Kubernetes with hostname-backchannel-dynamic"
date: 2026-02-16
categories:
- devops
tags:
- keycloak
- kubernetes
- networking
- authentication
---

## Introduction

Using OpenID Connect (OIDC) as an authentication source is one of the best practices when working with infrastructure, as it significantly improves both security and maintainability. [Keycloak](https://www.keycloak.org/) is an excellent open-source project widely adopted for this purpose. It supports many features and storage backends (such as PostgreSQL) and has straightforward deployment instructions on their official website.

However, I recently encountered an interesting challenge when deploying Keycloak in Kubernetes that required a specific configuration to solve internal service communication issues.

## The Problem: External Hostname vs Internal Access
When deploying Keycloak in Kubernetes, you typically specify a public hostname using the `--hostname=https://auth.example.com` parameter. This works perfectly for external clients accessing your authentication service.

But here's where it gets tricky: imagine you have other services running in your Kubernetes cluster—perhaps a container registry or CI server—that need to authenticate with Keycloak. These services need to access the discovery URL at `https://auth.example.com/realms/{realm-name}/.well-known/openid-configuration` to retrieve authentication configuration.

The issue arises because Keycloak internally always redirects to (and generates tokens/URLs based on) the hostname that was specified during deployment. But what happens when this public URL is not resolvable by pods inside the Kubernetes cluster? This creates a problem where internal services can't properly reach Keycloak for backchannel requests (token introspection, userinfo, etc.), even if they can reach the pod via internal DNS.

## The Solution: Dynamic Backchannel Hostname
Fortunately, Keycloak provides a CLI option to address this exact issue (available when the `hostname:v2` feature is enabled):

```bash
--features=hostname:v2
--hostname-backchannel-dynamic=true
```

This configuration tells Keycloak to dynamically determine the backchannel (internal) URLs based on the incoming request, allowing access via:

* Direct IP addresses
* Internal Kubernetes DNS (e.g., `keycloak.keycloak-namespace.svc.cluster.local:8080/realms/{realm-name}/.well-known/openid-configuration`)

## How It Works
With `--hostname-backchannel-dynamic=true` enabled:

1. External Access: Clients outside the cluster use the public hostname (`https://auth.example.com`) for authentication flows.
2. Internal Access: Services within the cluster can use the internal Kubernetes service DNS name to communicate directly with Keycloak pods.

This dual-access approach ensures that:

* External clients get the proper public URL for authentication flows
* Internal services can reliably reach Keycloak using cluster-internal DNS resolution
* No complex network routing or additional ingress configuration is needed just for internal communication

**Note for production**: For this to work securely, make sure your ingress / reverse proxy correctly passes `Forwarded` or `X-Forwarded-*` headers, and consider enabling HTTPS on both external and internal access paths.

## Example Configuration

Here's how you might configure this in a Kubernetes deployment:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: keycloak
spec:
  template:
    spec:
      containers:
      - name: keycloak
        image: quay.io/keycloak/keycloak:latest
        args:
        - start
        - --features=hostname:v2           # required for dynamic backchannel
        - --hostname=https://auth.example.com
        - --hostname-backchannel-dynamic=true
        - --db=postgres
        - --proxy-headers=forwarded        # important for correct header handling behind proxy/ingress
        # ... other configuration (ports, HTTPS, DB credentials via env vars, etc.)
```

## Conclusion

The --hostname-backchannel-dynamic=true flag (combined with the hostname:v2 feature) is a simple yet powerful solution for mixed internal/external access scenarios in Kubernetes. While the public URL remains ideal for external client access, internal service-to-service communication often requires this flexibility.

Keycloak's hostname configuration options make it a robust choice for authentication infrastructure in containerized environments.

## References

- [Keycloak Official Documentation](https://www.keycloak.org/documentation)
- [Keycloak Server Configuration](https://www.keycloak.org/server/hostname)
