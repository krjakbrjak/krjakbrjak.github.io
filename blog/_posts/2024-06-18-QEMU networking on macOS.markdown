---
layout: post
title:  "QEMU networking on macOS"
date:   2024-06-18
categories:
- devops
- macos
- networking
tags:
- qemu
- networking
- macos
- vm
- devops
---

## Introduction

Setting up virtual machines (VMs) that can communicate with each other and are accessible from your host network is essential for various scenarios, such as managing Kubernetes clusters or setting up distributed computing environments. In this article, I explore how QEMU's [vmnet](https://developer.apple.com/documentation/vmnet) support simplifies this process, allowing you to configure VMs effectively to meet your networking needs. Discover how you can enhance your workflow and improve collaboration between virtual instances and your host system.

## QEMU networking

[QEMU](https://www.qemu.org/) is an excellent open-source project that enables users to work on various projects across multiple platforms. Starting a VM instance with QEMU is straightforward. On my old Intel-based Mac, the following command will launch an Ubuntu cloud image:

```shell
qemu-system-x86_64 \
    -machine q35 -accel hvf -m 2048 \
    -nographic -hda ./ubuntu-25.04-server-cloudimg-amd64.img \
    -smbios type=1,serial=ds='nocloud;s=http://192.168.178.37:8000/'
```

QEMU supports networking by emulating several popular network cards. According to the [documentation](https://wiki.qemu.org/Documentation/Networking), there are two parts to networking within QEMU:

1. The virtual network device provided to the guest.
2. The network backend that interacts with the emulated NIC.

By default, QEMU creates a [SLiRP](https://en.wikipedia.org/wiki/Slirp) user network backend and an appropriate virtual network device for the guest, equivalent to using `-net nic -net user` on the command line. This network setup allows access to both the host and the internet, making it suitable for many use cases.

The primary drawback is that the VM cannot be accessed from the host or other VM instances. While port forwarding can be configured, it is inconvenient as it requires configuration for each port in the instance. For example:

```shell
qemu-system-x86_64 \
    -machine q35 -accel hvf -m 2048 \
    -nographic -hda ./ubuntu-25.04-server-cloudimg-amd64.img \
    -smbios type=1,serial=ds='nocloud;s=http://192.168.178.37:8000/' \
    -netdev user,id=mynet0,hostfwd=tcp::2222-:22,hostfwd=tcp::8080-:80 \
    -device e1000,netdev=mynet0
```

From the host, one can perform tasks like `ssh -p 2222 user@localhost` or `curl localhost:8080`.

However, it would be much more convenient to have a VM instance accessible on the host network. This setup would allow spawning multiple VM instances that can be accessed from the host and communicate with each other.

On macOS, the [vmnet](https://developer.apple.com/documentation/vmnet) framework facilitates this, and it is already supported by QEMU. This feature was added in [net-pull-request](https://github.com/qemu/qemu/commit/bcf0a3a422cd5d1b1c3c09c0e161205837dbe131) to the QEMU git tree. To utilize this functionality, the original command must be modified as follows:

```shell
qemu-system-x86_64 \
    -machine q35 -accel hvf -m 2048 -nographic \
    -hda ./ubuntu-25.04-server-cloudimg-amd64.img \
    -smbios type=1,serial=ds='nocloud;s=http://192.168.178.37:8000/' \
    -netdev vmnet-bridged,id=net0,ifname=en0 \
    -device virtio-net,netdev=net0
```

See `qemu-system-x86_64 -netdev help` for more details.

## Conclusion

The vmnet support in QEMU offers a straightforward method to create VM instances that can easily communicate with each other and are accessible from your network. This capability is particularly valuable in scenarios such as managing a Kubernetes cluster, where you need seamless interaction between a control plane and multiple worker nodes. Take advantage of these tools to streamline your virtual environment setup and enhance your workflow.
