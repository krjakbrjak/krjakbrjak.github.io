---
layout: post
title:  "Network Namespaces: Isolating VM Networking"
date:   2025-11-29
categories:
- devops
- networking
- virtualization
tags:
- devops
- infrastructure
- networking
- namespaces
- linux
---

In my previous articles, I discussed various networking approaches for Linux virtualization. I developed [qcontroller](https://github.com/q-controller/qcontroller), a tool responsible for managing the complete lifecycle of QEMU VM instances—creating, starting, stopping, and removing VMs with database-like operations.

Since modern VMs typically require internet access and inter-VM communication, qcontroller also manages firewall settings using nftables rules. The original networking scheme involved creating bridges, configuring nftables chains, and establishing rules to allow traffic flow between the internet, VMs, and host system. Each VM connects through a TAP device that uses the bridge as its master interface.

While this approach works well, it has a significant drawback: all networking components—bridges, TAP devices, and nftables rules—exist within the host's network stack. This "pollution" of the host networking requires careful cleanup to avoid breaking the host system when removing VMs. Each interface and rule must be individually and properly removed.

I prefer solutions where removing a single component automatically cleans up everything else. Fortunately, Linux provides exactly this capability through **network namespaces**. Let's explore how network namespaces can help build a cleaner, more isolated solution for managing VM networking.

## What are Network Namespaces?

Most developers familiar with Docker have encountered the concept of [namespaces](https://en.wikipedia.org/wiki/Linux_namespaces), particularly network namespaces. This Linux kernel feature allows you to create isolated network stacks on the same physical host, each appearing as a completely separate network environment. According to the [Linux manual pages](https://man7.org/linux/man-pages/man7/network_namespaces.7.html):

> Network namespaces provide isolation of the system resources associated with networking: network devices, IPv4 and IPv6 protocol stacks, IP routing tables, firewall rules, the /proc/net directory (which is a symbolic link to /proc/pid/net), the /sys/class/net directory, various files under /proc/sys/net, port numbers (sockets), and so on. In addition, network namespaces isolate the UNIX domain abstract socket namespace (see unix(7)).

This is exactly what we need—a completely separate network stack with its own devices, routing tables, and firewall rules. However, when you create a new network namespace, it starts empty with no network devices. So how do we connect it to the internet? [The Linux manual](https://man7.org/linux/man-pages/man7/network_namespaces.7.html) explains the solution:

> A virtual network (veth(4)) device pair provides a pipe-like abstraction that can be used to create tunnels between network namespaces, and can be used to create a bridge to a physical network device in another namespace. When a namespace is freed, the veth(4) devices that it contains are destroyed.

The key insight here is the automatic cleanup: when a namespace is deleted, all its contained veth devices are automatically destroyed—exactly the behavior we want!

<p align="center">
  <img src="/images/posts/Network Namespaces: Isolating VM Networking/namespaces.svg" alt="Network namespace"/>
</p>

## Creating and Configuring a Network Namespace

Since our host network stack has internet connectivity, we need to connect our new namespace to the host network using a veth pair (which acts like a virtual ethernet cable). For the pair to communicate, both ends need IP addresses. Here are the commands to set this up:

```shell
# Create a new network namespace called 'example'
sudo ip netns add example

# Create a veth pair (virtual ethernet cable)
sudo ip link add host-veth type veth peer name example-veth

# Move one end of the veth pair into the new namespace
# (initially both ends exist in the host namespace)
sudo ip link set example-veth netns example

# Assign IP addresses to both ends of the veth pair
sudo ip addr add 192.168.26.1/24 dev host-veth              # Host end
sudo ip netns exec example ip addr add 192.168.26.2/24 dev example-veth  # Namespace end

# Bring both interfaces up
sudo ip link set dev host-veth up
sudo ip netns exec example ip link set dev example-veth up
```

After executing these commands, we have successfully configured a new network namespace and connected it to the host namespace via a veth pair. Let's test the connectivity with `ip netns exec example ping 192.168.26.1`:

```shell
PING 192.168.26.1 (192.168.26.1) 56(84) bytes of data.
64 bytes from 192.168.26.1: icmp_seq=1 ttl=64 time=0.038 ms
64 bytes from 192.168.26.1: icmp_seq=2 ttl=64 time=0.073 ms
64 bytes from 192.168.26.1: icmp_seq=3 ttl=64 time=0.070 ms
```

Excellent! The connection works. Notice that network devices belonging to different namespaces are isolated from each other (try running `ip a` in both namespaces to see this separation).

Now we have two separate network stacks that can communicate with each other. However, only the host can access the internet. To provide internet access to our new namespace, we need to configure routing and NAT rules.

## Enabling Internet Access

First, we need to configure the namespace to route all traffic through the host veth interface:

```shell
# Set default route in the namespace to use the host veth interface
sudo ip netns exec example ip route add default via 192.168.26.1
```

Next, we need to configure the host to forward traffic and perform NAT:

```shell
# Enable IP forwarding in the kernel
sudo sysctl -w net.ipv4.ip_forward=1

# Allow established connections from internet back to namespace
sudo iptables -A FORWARD -i enp0s1 -o host-veth -m state --state RELATED,ESTABLISHED -j ACCEPT

# Allow new outgoing connections from namespace to internet
sudo iptables -A FORWARD -i host-veth -o enp0s1 -j ACCEPT

# Masquerade (NAT) traffic from the namespace subnet
sudo iptables -t nat -A POSTROUTING -s 192.168.26.0/24 -o enp0s1 -j MASQUERADE
```

**Note:** Replace `enp0s1` with your actual physical network interface name (find it with `ip route show default`).

Now the namespace can reach the internet! Test with `sudo ip netns exec example ping 8.8.8.8`:

```shell
PING 8.8.8.8 (8.8.8.8) 56(84) bytes of data.
64 bytes from 8.8.8.8: icmp_seq=1 ttl=117 time=10.2 ms
64 bytes from 8.8.8.8: icmp_seq=2 ttl=117 time=9.66 ms
64 bytes from 8.8.8.8: icmp_seq=3 ttl=117 time=9.31 ms
```

## Adding Bridge and TAP Devices for VMs

Now we have established a separate network stack connected to both the host and internet. This is already powerful, but for my use case, I wanted to run all VMs inside this isolated network namespace to avoid polluting the host networking and enable easy cleanup—simply delete the namespace and all virtual interfaces disappear automatically.

To achieve this, we need to make a few adjustments:

1. **Create a bridge** within the namespace
2. **Remove the IP address** from the namespace veth interface
3. **Assign the IP address** to the bridge instead
4. **Set the bridge as master** for the veth interface
5. **Connect all VM TAP devices** to this bridge

```shell
# Create a bridge in the namespace
sudo ip netns exec example ip link add name br0 type bridge

# Remove IP from veth interface and add it to the bridge
sudo ip netns exec example ip addr del 192.168.26.2/24 dev example-veth
sudo ip netns exec example ip addr add 192.168.26.2/24 dev br0

# Add veth interface to the bridge
sudo ip netns exec example ip link set example-veth master br0

# Bring the bridge up
sudo ip netns exec example ip link set br0 up
```

Now all VM TAP devices created within this namespace will use the bridge as their master, and all VM networking components live in the dedicated namespace. For implementation details, see [this pull request](https://github.com/q-controller/qcontroller/pull/6) showing how this was integrated into qcontroller.

## Bonus: Embedded DHCP Server

This networking redesign was partly motivated by the inconvenience of relying on external DHCP servers. Managing a separate DHCP service—starting it independently and configuring interfaces—initially seemed like it would provide flexibility, but in practice proved cumbersome.

I wanted to integrate a DHCP server directly into qcontroller, but faced a significant obstacle: DHCP servers must bind to port `67`. If the host system already has a DHCP service running on this port, you cannot start another one in the same network namespace.

Network namespaces solve this elegantly! Since each namespace has its own isolated network stack, including port space, you can run a DHCP server on port `67` within the namespace without conflicts. This allows qcontroller to provide integrated DHCP services for VM networking while keeping everything cleanly separated from the host system.

## Conclusion

Network namespaces provide an elegant solution for isolating VM networking infrastructure. Key benefits include:

- **Clean separation** of VM networking from host networking
- **Automatic cleanup** when deleting the namespace
- **Port isolation** enabling embedded services like DHCP
- **Complete control** over routing, firewall rules, and network topology
- **Simplified management** through namespace-scoped operations

By leveraging network namespaces, we can build more robust and maintainable virtualization solutions that don't interfere with the host system's networking configuration.