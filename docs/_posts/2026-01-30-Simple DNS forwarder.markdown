---

layout: post
title:  "Building a Simple DNS Forwarder for VMs in Go"
date:   2026-01-30
categories:
- devops
- dns
- virtualization
tags:
- go
- networking
- dns
---

{% assign netns = site.posts | where: "title", "Network Namespaces: Isolating VM Networking" | first %}

Learn how to build a smart DNS forwarder in Go for QEMU VMs managed by qcontroller. Automatically sync host DNS (including VPN changes) using fsnotify, miekg/dns, and CoreDHCP — without touching running guest configurations.

## Introduction: Why DNS "Just Works" … Until It Doesn't

On modern Linux systems, systemd-resolved handles DNS resolution transparently — you rarely need to think about it. It simply works.
But when managing QEMU-based virtual machines with [qcontroller](https://github.com/q-controller/qcontroller), things get more interesting. `qcontroller` supports two main ways to configure networking and DNS for VM instances:

* **DHCP (default fallback)**
* **Cloud-Init network configuration**

When Cloud-Init's network config is not used, it falls back to DHCP. As explained in [the previous post]({{ netns.url }}), qcontroller runs the QEMU process inside a dedicated network namespace connected to the host's root namespace via a veth pair.
This namespace isolation is powerful: port 53 (DNS) is free inside the namespace, so we can run our own DHCP and DNS services without conflicts.
For DHCP, I use the excellent, modular [CoreDHCP](https://github.com/coredhcp/coredhcp) server — embedded and running in a separate goroutine. One of its key configuration fields is the DNS server IP (DHCP clients always query DNS on port 53). I simply pass the nameserver IPs from the QEMU subcommand configuration:
```json
    "linuxSettings": {
        "network": {
            "name": "br0",
            "gateway_ip": "192.168.71.1/24",
            "bridge_ip": "192.168.71.3/24",
            "dhcp": {
                "start": "192.168.71.4/24",
                "end": "192.168.71.254/24",
                "lease_time": 86400,
                "dns": ["8.8.8.8", "8.8.4.4"],
                "lease_file": "./build/run/qcontroller-dhcp-leases"
            },
            "start_dns": true
        }
    }
```

This configuration will start the internal DNS server and use the IPs specified in the `dns` field as fallback DNS resolvers.

When static IPs are preferred, you can provide Cloud-Init network config with dedicated nameservers. This setup is reliable: start the VM, and everything configures itself automatically.
I thought my work was done — until I connected the host to a VPN. Suddenly, DNS resolution for resources in the VPN subnet stopped working inside the VMs.

## The Two Core Problems

1. **Detecting host DNS changes (e.g., new VPN nameservers added to the host)**
2. **Propagating those changes to running VMs without disrupting or compromising guest services**

Touching running VMs directly is dangerous — a mistake could break critical services. We need a safer approach.

### Solution Part 1: Detecting Host DNS Changes Reliably

On Linux, nameservers are traditionally listed in `/etc/resolv.conf`. But on `systemd`-based systems, `/etc/resolv.conf` is usually a symlink to a stub file pointing to `127.0.0.53` (`systemd-resolved`’s local resolver). The real upstream servers are managed elsewhere.

The correct location is:

* `/run/systemd/resolve/resolv.conf` (on systemd systems)
* `/etc/resolv.conf` (fallback for non-systemd setups)

Because `qcontroller` runs in a separate network namespace, we can still access these host files via the namespace setup.
Polling the file works but wastes resources. Better: _watch for changes using filesystem notifications_.
In Go, the battle-tested [fsnotify](https://github.com/fsnotify/fsnotify) library handles this perfectly. For maximum reliability (especially with systemd's atomic renames), watch the parent directory (`/run/systemd/resolve/` or `/etc/`) instead of the file itself. This captures creates, removes, and modifications cleanly.

### Solution Part 2: Parsing resolv.conf Without Reinventing the Wheel

Once a change is detected, parse the file to extract upstream servers.
Parsing `resolv.conf` manually is doable but error-prone and best avoided. Instead, use the mature [miekg/dns](https://github.com/miekg/dns) library — the de-facto standard DNS toolkit in Go. It includes built-in parsers:

```go
import "github.com/miekg/dns"

upstreams := []string{}
cfg, cfgErr := dns.ClientConfigFromFile("/run/systemd/resolve/resolv.conf")
if cfgErr != nil {
    // fallback to /etc/resolv.conf
    cfg, cfgErr = dns.ClientConfigFromFile("/etc/resolv.conf")
}

if cfgErr == nil {
  for _, server := range cfg.Servers {
    upstreams = append(upstreams, net.JoinHostPort(server, cfg.Port))
  }
}

// upstreams now contains the upstream addresses
```

With *fsnotify* + *miekg/dns*, we reliably detect and load updated upstreams from the host.

### Solution Part 3: Static DNS in VMs + Smart Forwarding

Instead of dynamically reconfiguring VMs (risky!), give every VM a single, static DNS resolver IP — the address of our embedded DNS server inside the namespace.
But how can one static resolver handle host DNS changes (VPNs, etc.)?
Enter a **custom DNS forwarder**:

* Listens on port 53 in the VM namespace
* Forwards queries sequentially to the current upstream list (from host `resolv.conf`)
* Returns immediately on the first positive response (NOERROR + answers > 0)
* Otherwise continues to the next upstream
* Falls back to the last negative response (e.g. NXDOMAIN or NODATA)
* Returns SERVFAIL only if all upstreams fail completely (network errors)

This "optimistic fallback until positive" logic is simple yet powerful — it mirrors real-world needs like **VPN + public DNS chaining**.
The full implementation lives in `qcontroller` — see the [latest changes](https://github.com/q-controller/qcontroller/pull/24).

## Fallback for Resilience

What happens if `qcontroller` crashes (hopefully not the case!) or stops? VMs keep running, but DNS updates from the host stop.
To handle this gracefully, configure a fallback nameserver list in the QEMU config (e.g., `8.8.8.8`, `1.1.1.1`, `9.9.9.9`). VMs then fall back to public DNS — not ideal for internal/VPN resources, but better than total failure.

## Conclusion

With this setup:

* VMs always use a single, static DNS IP
* The embedded forwarder dynamically follows host DNS changes (including VPN connections)
* No guest reconfiguration needed → zero risk to running services
* Reliable detection via **fsnotify** + robust parsing via **miekg/dns**
* Graceful fallback via configurable public resolvers

Your VMs now have the exact same network connectivity as the host root namespace — **automatically**.

Enjoy hassle-free DNS in your VM fleet!
