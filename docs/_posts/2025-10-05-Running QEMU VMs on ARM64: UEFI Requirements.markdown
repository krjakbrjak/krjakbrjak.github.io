---
layout: post
title:  "Running QEMU VMs on ARM64: UEFI Requirements"
date:   2025-10-05
categories:
- devops
- virtualization
- arm64
tags:
- devops
- infrastructure
- qemu
- uefi
---

In my previous notes, I've discussed how [QEMU](https://www.qemu.org/) serves as a versatile and flexible tool for creating and managing virtual machines. One of QEMU's greatest strengths is its support for a wide range of platforms, making it an ideal choice for cross-platform development and testing. However, this versatility requires us to understand the subtle differences between architectures when configuring our VMs.

In this article, I'll explain why the QEMU commands that work for x86_64 platforms require specific adjustments when running ARM64 VMs, with a particular focus on the UEFI firmware requirements that are essential for ARM64 virtualization.

## Understanding the Difference: ARM64 vs x86_64 Booting

When working with ARM64 architecture, there's a fundamental difference in how the system boots compared to traditional x86_64 systems. While ARM64 can utilize different boot methods including U-Boot for embedded systems, UEFI (Unified Extensible Firmware Interface) is the default and preferred method for server and cloud environments. As documented in the [Ubuntu server virtualization guide](https://documentation.ubuntu.com/server/how-to/virtualisation/qemu/index.html), Ubuntu ARM64 cloud images specifically rely on UEFI for hardware initialization and kernel loading.

Unlike x86_64, which can boot using legacy BIOS or UEFI without additional configuration in QEMU, ARM64 cloud images typically require explicitly configured UEFI firmware. When using QEMU for ARM64 virtualization with cloud images like Ubuntu, we must explicitly provide:

1. **UEFI Firmware (.fd) file**: These files contain the actual UEFI firmware code, which includes drivers, bootloaders, and the pre-boot environment for the system. Think of this as the replacement for traditional BIOS.

2. **UEFI Variables (.vars) file**: These store data in the system's non-volatile RAM (NVRAM) that control the UEFI environment. This includes critical information such as the default boot entry, boot order, and secure boot settings.

## Finding Available Firmware Files

Fortunately, when you install QEMU, it automatically includes supported firmware files for various architectures. To locate the firmware files available in your QEMU installation, run:

```shell
qemu-system-aarch64 -L help
```

This command will display output similar to:

```shell
/opt/homebrew/Cellar/qemu/10.1.0/bin/../share/qemu-firmware
/opt/homebrew/Cellar/qemu/10.1.0/bin/../share/qemu
```

These directories contain both firmware and UEFI variable files for different architectures. For ARM64 (aarch64) with the "virt" machine type, the suitable firmware is typically `edk2-aarch64-code.fd`.

## Properly Configuring ARM64 VMs

To run an ARM64 VM, we need to adjust our QEMU command from what we might use for x86_64. Here's a proper example for running an Ubuntu ARM64 cloud image:

```shell
qemu-system-aarch64 \
  -machine virt -accel hvf -m 2048 \
  -nographic -hda ./ubuntu-25.04-server-cloudimg-amd64.img \
  -smbios type=1,serial=ds='nocloud;s=http://192.168.178.37:8000/'
  -bios edk2-aarch64-code.fd
```

Let's break down the new elements that are specific to ARM64:

- `-machine virt`: We use the "virt" machine type instead of "q35" (which is for x86_64)
- `-bios`: option to specify firmware

The `bios` parameter is critical here as it tells QEMU to use UEFI firmware.

## Conclusion

Running ARM64 VMs with QEMU requires understanding the essential role that UEFI plays in the boot process. By correctly specifying the firmware, you can successfully run ARM64 virtual machines even on different host architectures.

## Useful links
- [FreeBSD on QEMU ARM64](https://wiki.freebsd.org/arm64/QEMU)
- [Virtualisation with QEMU](https://documentation.ubuntu.com/server/how-to/virtualisation/qemu/index.html)
