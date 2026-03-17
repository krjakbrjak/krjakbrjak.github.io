---

layout: post
title: "When systemd-resolved Picks the Wrong DNS Server"
description: "systemd-resolved treats all configured DNS servers as equivalent. Here's why that breaks private DNS resources in VMs and how I worked around it."
date: 2026-03-17
categories:
- devops
- dns
- virtualization
tags:
- go
- networking
- dns
- systemd
---

{% assign dns_post = site.posts | where: "title", "Building a Simple DNS Forwarder for VMs in Go" | first %}
{% assign netns_post = site.posts | where: "title", "Network Namespaces: Isolating VM Networking" | first %}

In a [previous post]({{ dns_post.url }}), I described how I built a DNS forwarder for [qcontroller](https://github.com/q-controller/qcontroller) — a tool that manages QEMU VM instances. The forwarder watches the host's `resolv.conf` for changes and propagates upstream DNS servers to VMs transparently. It worked great — until I noticed that VMs occasionally failed to resolve private hostnames defined in the host's `/etc/hosts`.

## The Symptom

The setup was straightforward. Inside each VM, DHCP advertised three DNS servers: the gateway IP (pointing to the forwarder) plus `8.8.8.8` and `1.1.1.1` as fallbacks. From the host, querying the forwarder directly worked fine:

```
$ dig @192.168.71.1 myserver.internal.corp
;; ANSWER SECTION:
myserver.internal.corp.	0	IN	A	10.0.50.42
```

But from inside a VM:

```
$ dig myserver.internal.corp
;; ->>HEADER<<- opcode: QUERY, status: NXDOMAIN
;; SERVER: 127.0.0.53#53(127.0.0.53) (UDP)
```

NXDOMAIN. The VM's systemd-resolved returned a negative answer — even though the forwarder had the correct one. What was going on?

## systemd-resolved Treats All DNS Servers as Equivalent

A quick `resolvectl status` inside the VM revealed the problem:

```
Current DNS Server: 1.1.1.1
       DNS Servers: 192.168.71.1 1.1.1.1 8.8.8.8
```

systemd-resolved had picked `1.1.1.1` as its active server — not the forwarder. And `1.1.1.1` knows nothing about my private `/etc/hosts` entries.

This is by design. From the [systemd-resolved documentation](https://www.freedesktop.org/software/systemd/man/latest/systemd-resolved.service.html):

> The nss-dns resolver maintains little state between subsequent DNS queries, and for each query always talks to the first listed DNS server from /etc/resolv.conf first, and on failure continues with the next until reaching the end of the list which is when the query fails. The resolver in systemd-resolved however maintains state, and will continuously talk to the same server for all queries in a particular lookup scope until some form of error is seen at which point it will switch to the next server, and then stay with it for all queries on the scope until the next failure, and so on, eventually returning to the first configured server. This is done to optimize lookup times, in particular given that the resolver typically must first probe server feature sets when talking to a server, which takes time. **This different behaviour implies that listed DNS servers per lookup scope must be equivalent in the zones they serve, so that sending a query to one of them will yield the same results as sending it to another configured DNS server.**

In other words: all configured DNS servers within a scope are treated as **interchangeable**. systemd-resolved picks one, sticks with it, and only rotates on failure. If `1.1.1.1` responds (even with NXDOMAIN), that counts as "working" — so it never bothers trying the forwarder.

The relevant selection logic lives in [`resolved-dns-scope.c`](https://github.com/systemd/systemd/blob/main/src/resolve/resolved-dns-scope.c) (`dns_scope_get_dns_server()`) and [`resolved-dns-server.c`](https://github.com/systemd/systemd/blob/main/src/resolve/resolved-dns-server.c) (`manager_next_dns_server()`).

## The Fix

The fix is straightforward: advertise **only** the forwarder's IP via DHCP, so the VM's systemd-resolved has no choice but to use it. No public servers in the mix means no wrong server to stick to.

## Forwarding to systemd-resolved

But the previous forwarder design had a gap. As described in the [earlier post]({{ dns_post.url }}), it read upstream servers from `/run/systemd/resolve/resolv.conf` — which contains the real upstream DNS servers (like `8.8.8.8`), bypassing systemd-resolved entirely. That means the forwarder also bypassed everything systemd-resolved provides: `/etc/hosts` resolution, mDNS, split-DNS, VPN routing.

What if the forwarder just forwarded to `127.0.0.53` instead?

It turns out this is easy to do. As explained in the [network namespaces post]({{ netns_post.url }}), the DNS forwarder runs in the **root network namespace** — it listens on the gateway IP (the host-side end of the veth pair), which is reachable from the VM namespace. Since it's in the root namespace, it can talk to `127.0.0.53` directly.

```
VM query ──► gateway IP:53 (forwarder, root ns) ──► 127.0.0.53 (systemd-resolved)
                                                         │
                                                         ├── /etc/hosts
                                                         ├── /etc/resolv.conf
                                                         ├── mDNS
                                                         ├── VPN split-DNS
                                                         └── ...
```

The forwarder just needed one small extension — a `WithUpstreams` option that accepts static upstream addresses instead of reading from a file:

```go
forwarder, err := dns.NewDNSFailoverForwarder(ctx,
    dns.WithForwarderAddress(gatewayIP),
    dns.WithForwarderTimeout(2*time.Second),
    dns.WithUpstreams([]string{"127.0.0.53:53"}),
)
```

When `WithUpstreams` is provided, the forwarder stores the addresses directly — no file watching, no fsnotify, no resolv.conf parsing. When it's not provided, the existing behavior kicks in: watch `resolv.conf` and update upstreams dynamically.

The configuration is modeled as a protobuf `oneof`, making the two modes mutually exclusive:

```protobuf
message Dns {
    string zone = 1;
    oneof upstream {
        string resolv_conf = 2;
        StaticUpstreams static = 3;
    }
}
```

When neither is set, the forwarder falls back to auto-detecting the resolv.conf path — preserving full backward compatibility.

## Covering All Cases

This naturally leads to three deployment modes, each covering different environments:

**systemd-resolved (most Linux desktops/servers):** Use static upstreams pointing to `127.0.0.53`. Gets `/etc/hosts`, mDNS, split-DNS, VPN — everything systemd-resolved handles.

```json
"dns": {
    "zone": ".",
    "static": {
        "endpoints": ["127.0.0.53:53"]
    }
}
```

**Non-systemd with resolv.conf:** Use the dynamic resolv.conf watcher. The forwarder picks up upstream changes automatically.

```json
"dns": {
    "zone": ".",
    "resolv_conf": "/etc/resolv.conf"
}
```

**Non-systemd with CoreDNS:** For environments where CoreDNS plugins are needed (e.g., the [`hosts` plugin](https://coredns.io/plugins/hosts/) for `/etc/hosts` support), qcontroller also supports an embedded CoreDNS backend:

```go
server, err := dns.NewCoreDNSServer(ctx,
    dns.WithForwarderAddress(gatewayIP),
    dns.WithResolvconfPath("/etc/resolv.conf"),
)
```

## Conclusion

The root cause came down to a design assumption in systemd-resolved: all configured DNS servers must be equivalent. When some know about private resources and others don't, things break in subtle, hard-to-debug ways.

The fix turned out to be small. The forwarder already ran in the root namespace, so `127.0.0.53` was right there. Adding a `WithUpstreams` option and a `oneof` in the protobuf schema was enough to make it work. VMs get full host DNS resolution — `/etc/hosts`, VPN, mDNS — without touching their configuration.
