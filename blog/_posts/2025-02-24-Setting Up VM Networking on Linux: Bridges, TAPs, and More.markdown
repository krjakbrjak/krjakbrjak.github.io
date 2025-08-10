---
layout: post
title:  "Setting Up VM Networking on Linux: Bridges, TAPs, and More"
date:   2025-02-24
categories: jekyll update
---

{% assign qemu_macos = site.posts | where: "title", "QEMU networking on macOS" | first %}

## Introduction

Working directly on your computer and trying out new configurations is crucial for mastering new technologies. Experimenting with different libraries, frameworks, or applications often leads to situations where your system might not behave as expected. That’s why it’s a good idea to test these experiments in an isolated environment that won’t affect your host OS. Virtual machines (VMs) offer complete isolation and behave like separate physical machines. However, because a VM is essentially a “separate machine,” its networking must be configured properly to enable communication with the host—ideally bidirectional—as well as provide internet access. This post describes the necessary steps, such as creating a bridge and adjusting firewall rules, to enable networking.

## QEMU

There are several VM tools available, but QEMU boasts the widest support for different architectures. I’ve already [discussed]({{ qemu_macos.url }}) using QEMU on macOS before, and starting a VM on Linux is very similar. You can run the following command to launch a fully functional Ubuntu machine with internet connectivity:

```bash
qemu-system-x86_64 -machine q35 -accel kvm -m 2048 \
    -hda ./ubuntu-22.04-server-cloudimg-amd64.img \
    -cpu host -nographic \
    -smbios type=1,serial=ds=nocloud;s=http://192.168.178.41:8000/
```

In this example, the image is [ubuntu-22.04-server-cloudimg-amd64.img](https://cloud-images.ubuntu.com/releases/22.04/release/ubuntu-22.04-server-cloudimg-amd64.img), a cloud image that conveniently comes with cloud-init pre-installed. The issue, as described in a previous article, is that QEMU by default starts an instance with a “user network” that is inaccessible from the host. Additionally, communication between VMs is not straightforward. While on macOS the [vmnet framework](https://developer.apple.com/documentation/vmnet) provides a solution, Linux doesn’t offer an out-of-the-box equivalent. However, you can easily achieve the desired setup by configuring a bridge and attaching a TAP device to it. This newly created TAP device can then be specified as the network interface when starting a VM. Let’s take a look at how to create this setup and address the key aspects needed to make it work.

## Bridge + tap device

A network bridge is a virtual or physical device that connects two or more network interfaces, allowing them to communicate as if they were on the same network. Operating at Layer 2 (the Data Link Layer) of the OSI model, a bridge forwards Ethernet frames between interfaces.

* A bridge learns the MAC addresses of the devices connected to its interfaces.
* It forwards traffic only to the appropriate interface based on these MAC addresses, reducing unnecessary network load.
* Devices on a bridge can communicate without a router, as long as they are on the same subnet.
You can create a bridge using the following command:
```bash
sudo ip link add name ${BRIDGE_NAME} type bridge
IFS='./' read -r a b c d mask <<< "${SUBNET}"
sudo ip addr add "$a.$b.$c.1/${mask}" dev ${BRIDGE_NAME}
sudo ip link set ${BRIDGE_NAME} up
```

A TAP (Terminal Access Point) device is a virtual network interface that operates at Layer 2 of the OSI model, allowing software to send and receive raw Ethernet frames. This makes it especially useful for virtual networking, VPNs, and emulation.

* TAP devices act like physical Ethernet interfaces but exist entirely in software.
* They are commonly used to connect virtual machines, containers, or VPNs to a network.
* When an application writes to a TAP interface, it appears as if packets are coming from a real network device.
You can create a TAP device with the following commands:

    ```bash
    sudo ip tuntap add dev ${TAP_DEVICE} mode tap
    sudo ip link set ${TAP_DEVICE} up
    sudo ip link set ${TAP_DEVICE} master ${BRIDGE_NAME}
    ```

In this setup:

* A TAP device is assigned to the VM, simulating a network adapter.
* This TAP device is attached to a bridge (${BRIDGE_NAME}), allowing multiple VMs (or containers) to share the same network.
* The bridge is configured with a specific subnet (e.g., 192.168.100.0/24), effectively acting as a virtual LAN.
However, to ensure the network works as expected, additional configuration is necessary:
    1. Enable host routing. The host must act as a router, allowing traffic from the VM to reach external networks and return. This is achieved by enabling masquerading (NAT) for outbound traffic:

        ```bash
        iptables -t nat -A POSTROUTING -o ${LAN_INTERFACE} -j MASQUERADE
        iptables -t nat -A POSTROUTING -j RETURN
        ```

        * The first rule enables MASQUERADE NAT, which translates the VM’s private IP address to the host's IP when traffic is sent out via ${LAN_INTERFACE} (e.g., eth0 or wlan0).
        * The second rule (RETURN) ensures that packets not needing NAT pass through unmodified.

    2. Allow traffic on the bridge:

        ```bash
        sudo iptables -I INPUT -i ${BRIDGE_NAME} -p udp -j ACCEPT
        sudo iptables -I INPUT -i ${BRIDGE_NAME} -p tcp -j ACCEPT
        sudo iptables -I FORWARD -i ${BRIDGE_NAME} -p udp -j ACCEPT
        sudo iptables -I FORWARD -i ${BRIDGE_NAME} -p tcp -j ACCEPT
        ```

        * These rules allow incoming (INPUT) and forwarded (FORWARD) traffic from the bridge, ensuring that packets can move between the VM and other devices.
        * Without these rules, the VM might be isolated due to firewall restrictions.

This configuration allows a VM to access external networks while maintaining internal communication via the bridge. It’s a common setup for QEMU/KVM networking, where VMs obtain private IPs yet still have full internet access through the host.

After completing the bridge and TAP setup, you can create a VM instance using the following QEMU command:

```bash
qemu-system-x86_64 -machine q35 -accel kvm \
    -m 2048 -nographic -device virtio-net,netdev=net0,mac=02:4c:40:5b:f7:3c \
    -netdev tap,id=net0,ifname=${TAP_DEVICE},script=no,downscript=no \
    -smbios type=1,serial=ds=nocloud;s=http://192.168.178.41:8000/ \
    -hda ./ubuntu-22.04-server-cloudimg-amd64.img -cpu host
```

The newly created VM can be accessed from the host and from other VMs on the same subnet, and it can also access the internet.

## Conclusion

Setting up networking for VMs on Linux using bridges and TAP devices provides a flexible and powerful way to create isolated yet connected environments. By configuring a bridge, attaching TAP devices, and properly setting up firewall rules, we enable communication between the host, VMs, and external networks. This approach is particularly useful for running multiple VMs on the same virtual network, testing distributed systems, or setting up development environments.

_**P.S.**_ iptables is the firewall system used on Linux, but in most cases, firewall rules are not configured directly with iptables. Instead, they are managed using higher-level tools like ufw, which act as frontends for iptables. It is important to avoid conflicts with these tools. Therefore, it is safer to configure firewall rules using the firewall management tool already installed on your system. Additionally, these tools typically provide built-in functionality to reset firewall rules easily.

On Ubuntu, ufw is the default firewall tool, and the iptables rules from the previous section can be translated into ufw commands as follows:

```bash
sudo ufw allow in on ${BRIDGE_NAME} proto udp
sudo ufw allow in on ${BRIDGE_NAME} proto tcp
sudo ufw route allow in on ${BRIDGE_NAME} proto udp
sudo ufw route allow in on ${BRIDGE_NAME} proto tcp
```

_**P.P.S.**_ I’ve also created some convenient scripts to automate these operations. You can find them [here](https://github.com/krjakbrjak/vm-tool). It also configures and starts a DHCP server to enable automatic IP acquisition at the VM startup.
