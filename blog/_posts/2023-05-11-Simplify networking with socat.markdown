---
layout: post
title:  "Simplify networking with socat"
date:   2023-05-11
categories: jekyll update
---

In many cases, it's necessary to forward requests from one host to another. For instance, the minikube registry addon starts the Docker registry inside the minikube VM, so if you want to push locally built images to the registry, you need to forward the requests from your host to the minikube VM. When you use the docker driver to start minikube, the Docker VM and the minikube VM are connected to the same virtual network interface. The easiest way to forward the requests from your host to the minikube VM is to run `socat` inside a Docker container on your host and use it to forward requests to the minikube VM:

```
docker run --rm -it --network=host alpine ash -c \
    "apk add socat && socat TCP-LISTEN:5000,reuseaddr,fork TCP:$(minikube ip):5000"
```

`socat`, it's a powerful and versatile network tool that can simplify a wide range of networking tasks. I recommend checking out this helpful [post](https://www.redhat.com/sysadmin/getting-started-socat) on getting started with socat to learn more about what it can do.
