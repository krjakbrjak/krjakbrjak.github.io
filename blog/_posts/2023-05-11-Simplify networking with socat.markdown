---
layout: post
title:  "Simplify networking with socat"
date:   2023-05-11
categories: networking linux devops
tags:
- socat
- networking
- docker
- linux
- devops
---

`socat` is a versatile tool that can transfer data between two endpoints. These endpoints can be network sockets, serial devices, files, or even other processes. Think of it as a universal data tunnel:

```text
[endpoint A] <====> [endpoint B]
```

`socat` is especially useful for port forwarding, debugging network services, or connecting different protocols.

## Example 1: Accessing the minikube registry

The Minikube registry addon starts a Docker registry inside the Minikube VM. By default, it’s only available as `localhost:5000` inside the VM. To push images from your local machine, you need to expose that registry on your host’s `localhost:5000`.

```shell
docker run --rm -it -p 5000:5000 alpine ash -c \
    "apk add socat && socat TCP-LISTEN:5000,reuseaddr,fork TCP:$(minikube ip):5000"
```

Here’s what happens:

* Port 5000 on your host is published into the temporary Alpine container.
* Inside the container, socat forwards traffic to $(minikube ip):5000.
* Your local Docker client can now push images to localhost:5000, as if the registry were running directly on your host.

👉 You could also install socat directly on your host, but using a disposable container avoids cluttering your environment.

## Example 2: Letting a Container Reach a Host-Only Service

Sometimes a container needs to reach a service that is only available on your host—for example, something you access through a VPN. Instead of using the host network (which reduces isolation and can complicate Compose setups), you can combine `extra_hosts` with `socat`.

1. Add a hostname in your container that points to the host gateway:
    ```yaml
    services:
        dbservice:
            image: dbservice
            extra_hosts:
                - secret-vpn-service.com:host-gateway
    ```
    This makes the container resolve secret-vpn-service.com to your host’s IP.
2. On your host, run socat to forward the traffic:
    ```shell
    socat TCP-LISTEN:8080,reuseaddr,fork TCP:secret-vpn-service.com:8080
    ```

    Now, when the container connects to secret-vpn-service.com:8080, the traffic goes through your host and is relayed to the real secret-vpn-service.com:8080.

## Why use socat?

* Bridge services across VM and container boundaries.
* Forward traffic without exposing all containers to the host network.
* Keep setups clean with disposable containers.

`socat` makes it easy to connect isolated environments while keeping your networking setup flexible. For more information, check out this helpful [post](https://www.redhat.com/sysadmin/getting-started-socat) on getting started with socat.
