---
layout: post
title:  "Automating Bridge + TAP Networking with a Go Binary (No Bash, No Fuss)"
date:   2025-08-02
categories: jekyll update
---

{% assign other_post = site.posts | where: "title", "Setting Up VM Networking on Linux: Bridges, TAPs, and More" | first %}
## TL;DR:
In [my previous article]({{ other_post.url }}), I manually set up Linux bridge + TAP networking for VMs. This time, I built a Go tool that automates the whole process: creating a bridge, setting up a TAP device, configuring NAT and firewall rules via `nftables`, and ensuring traffic isn’t blocked by UFW. It’s a single binary that gives your VMs internet access and full host communication — no shell scripts or manual firewall hacking required. Check out the [source](https://github.com/q-controller/network-utils) and try it.

## Bridge networking shouldn’t feel like defusing a bomb

You just want the guest online — but fifteen minutes later, you’re still flipping `ip` flags, poking at `nftables`, and praying `UFW` doesn’t nuke your DHCP.

I’ve wrapped that whole ritual into a small Go binary: `network-utils`.
Run `create-bridge`, `configure-bridge`, `create-tap`, launch QEMU — done.

No bash. No orphaned firewall chains. Reproducible every time.

## Why another tool?

There are a few motivations behind building a dedicated tool:

* **Reproducibility**: I wanted a CLI that always configured things the same way, without depending on system state or shell scripts.

* **Firewall integration**: Tools like `UFW` often silently block bridged traffic unless you understand how it hooks into `nftables`. This tool handles that correctly.

* **Declarative, not imperative**: Just say "_create a bridge on 192.168.26.0/24_" — the tool will do the right thing.

## Design decisions

* `nftables` instead of `iptables`: Modern Linux distros default to nftables, and this tool configures NAT, forwarding, and firewall rules using it directly.
* **Custom chains for NAT/forwarding**: Instead of modifying default chains like forward, we inject our own and jump to them explicitly. This avoids interfering with UFW or systemd-managed rules.
* **Minimal dependencies**: It’s a Go binary with no external dependencies beyond `ethtool` for Tx checksum offload.
* **Wi-Fi note**: many WLAN chips can’t pass Ethernet frames, so the tool transparently falls back to masquerading - perfectly fine for most VM use-cases.

## How it works

Let’s say you want to give your QEMU guest a TAP interface bridged to your host Wi-Fi. The steps normally would look like:

1. Create a bridge (ip link add br0 type bridge)

2. Assign it an IP range (ip addr add 192.168.26.1/24 dev br0)

3. Enable forwarding, NAT, and allow DHCP/DNS

4. Create a TAP device

5. Attach it to the bridge

6. Route VM traffic through host interface (e.g. `wlan0`)

This tool wraps all of that into a few commands:

```shell
./network-utils create-bridge --name br0 \
    --cidr 192.168.26.0/24 --disable-tx-offload
./network-utils configure-bridge --name br0 --hostIf wlan0
./network-utils create-tap --name tap0 --bridge br0
```

## Firewall rules: done right

One of the trickiest parts of bridge networking is getting firewalling and NAT right without accidentally breaking DNS or DHCP. Here’s how this tool addresses that:

* **Masquerading**: Adds a NAT rule that masquerades outbound packets from the bridge subnet via the selected host interface.
* **Forwarding**: Allows forwarding between the bridge and the host interface in both directions.
* **DNS/DHCP**: Explicit rules allow UDP ports 53 and 67 to ensure clients can boot and resolve domains.
* **Chain isolation**: All rules are installed in dedicated nftables chains. These are jumped to from main chains before UFW or other tools get to filter traffic.

After configuration, your ruleset will look something like this:
```nft
chain INPUT {
    type filter hook input priority filter; policy drop;
    jump EXAMPLE-INPUT
    counter packets 192887 bytes 102499866 jump ufw-before-input
    counter packets 1927 bytes 858681 jump ufw-after-input
    counter packets 456 bytes 15792 jump ufw-after-logging-input
    counter packets 456 bytes 15792 jump ufw-reject-input
    counter packets 456 bytes 15792 jump ufw-track-input
}

chain FORWARD {
    type filter hook forward priority filter; policy drop;
    jump EXAMPLE-FORWARD
    counter packets 12152 bytes 74495358 jump DOCKER-FORWARD
    counter packets 0 bytes 0 jump ufw-before-logging-forward
    counter packets 0 bytes 0 jump ufw-before-forward
    counter packets 0 bytes 0 jump ufw-after-forward
    counter packets 0 bytes 0 jump ufw-after-logging-forward
    counter packets 0 bytes 0 jump ufw-reject-forward
    counter packets 0 bytes 0 jump ufw-track-forward
}

chain EXAMPLE-FORWARD {
    iifname "br0" oifname "wlp0s20f3" accept
    iifname "wlp0s20f3" oifname "br0" ct state established,related accept
}

chain EXAMPLE-INPUT {
    udp dport 53 accept
    udp dport 67 accept
    udp dport 68 accept
    tcp dport 53 accept
    tcp dport 67 accept
    tcp dport 68 accept
}
```

This makes the bridge + tap networking both **transparent** and **robust** — it survives UFW being enabled, and won’t conflict with unrelated system firewall rules.

## Full example: QEMU with internet access

Once the setup is done, launch your VM like this:

```shell
qemu-system-x86_64 -machine q35 -accel kvm -m 960 -nographic \
    -device virtio-net,netdev=net0,mac=2e:c8:40:59:7d:16 \
    -netdev tap,id=net0,ifname=tap0,script=no,downscript=no \
    -qmp unix:/tmp/test.sock,server,wait=off -cpu host -smp 1 -hda <IMAGE>
```
The guest will:

1. Have an IP assigned via DHCP (if you’re running a DHCP server on the bridge)

2. Be able to reach the host

3. Have outbound internet access via NAT

## Installation and permissions

Clone the repo, then: `go build`.

By default, network configuration requires elevated privileges. Instead of running the tool with `sudo`, you can grant it the necessary capability directly:
```shell
sudo setcap cap_net_admin,cap_sys_admin+ep ./network-utils
```
* `CAP_NET_ADMIN` - creating or configuring TAP devs/bridges
* `CAP_SYS_ADMIN` - Disabling TX offload via ethtool


## Conclusion

If you're doing VM automation or container networking and need a clean, modern, and firewall-safe bridge+tap setup — this tool is for you.
