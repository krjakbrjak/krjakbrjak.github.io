---
layout: post
title: "-hda vs virtio-blk: Match the Disk Bus to the Guest Image"
description: "qcontroller booted Ubuntu cloud images without problems, then broke on 26.04. The reason: the image switched to initrdless boot, and my -hda (SATA) disk no longer had a driver. Here's how I tracked it down."
date: 2026-06-25
categories:
- qemu
tags:
- devops
- qemu
- virtualization
---

An interesting problem I ran into recently: [qcontroller](https://github.com/q-controller/qcontroller) had been loading Ubuntu 22.04-25.04 images just fine, and then all of a sudden it stopped working with the 26.04 images. The guest VM crashed with:

```text
[    0.395796] /dev/root: Can't open blockdev
[    0.396053] VFS: Cannot open root device "PARTUUID=8bb858b9-78e0-48dc-9232-3d2e823ef748" or unknown-block(0,0): error -6
[    0.396640] Please append a correct "root=" boot option; here are the available partitions:
[    0.397116] fd00             368 vda 
[    0.397117]  driver: virtio_blk
[    0.397557] List of all bdev filesystems:
[    0.397805]  ext3
[    0.397805]  ext2
[    0.397955]  ext4
[    0.398108]  squashfs
[    0.398258]  vfat
[    0.398423]  fuseblk
[    0.398576] 
[    0.398872] Kernel panic - not syncing: VFS: Unable to mount root fs on unknown-block(0,0)
[    0.399335] CPU: 0 UID: 0 PID: 1 Comm: swapper/0 Not tainted 7.0.0-22-generic #22-Ubuntu PREEMPT(lazy) 
[    0.399862] Hardware name: QEMU Standard PC (Q35 + ICH9, 2009), BIOS 1.17.0-debian-1.17.0-1ubuntu1 04/01/2014
[    0.400404] Call Trace:
[    0.400582]  <TASK>
[    0.404080]  show_stack+0x49/0x60
[    0.404299]  dump_stack_lvl+0x5f/0x90
[    0.404536]  dump_stack+0x10/0x18
[    0.404755]  vpanic+0x262/0x4b0
[    0.404963]  panic+0x67/0x70
[    0.405158]  mount_root_generic+0x1ca/0x280
[    0.405414]  mount_root+0x86/0xa0
[    0.405636]  prepare_namespace+0x1ce/0x270
[    0.405889]  kernel_init_freeable+0x15f/0x180
[    0.406152]  ? __pfx_kernel_init+0x10/0x10
[    0.406402]  kernel_init+0x1b/0x160
[    0.406631]  ? __pfx_kernel_init+0x10/0x10
[    0.406885]  ret_from_fork+0x195/0x2a0
[    0.407120]  ? __pfx_kernel_init+0x10/0x10
[    0.407374]  ? __pfx_kernel_init+0x10/0x10
[    0.407638]  ret_from_fork_asm+0x1a/0x30
[    0.407886]  </TASK>
[    0.408071] Kernel Offset: 0x4e00000 from 0xffffffff81000000 (relocation range: 0xffffffff80000000-0xffffffffbfffffff)
[    0.408647] ---[ end Kernel panic - not syncing: VFS: Unable to mount root fs on unknown-block(0,0) ]---
```

The panic gave a clear clue: the kernel couldn't find the root disk. The only block device it saw was `vda`, the small cloud-init seed, and the real root partition was nowhere to be found.

## What changed between releases

To see what was different, I booted a known-good image (24.04, standing in for the 22.04-25.04 range) and the broken 26.04 one, and ran `cat /proc/cmdline` in each.

26.04 showed:

```text
BOOT_IMAGE=/vmlinuz-7.0.0-22-generic root=PARTUUID=8bb858b9-78e0-48dc-9232-3d2e823ef748 ro console=tty1 console=ttyS0 panic=-1
```

24.04 showed:

```text
BOOT_IMAGE=/vmlinuz-6.8.0-124-generic root=LABEL=cloudimg-rootfs ro console=tty1 console=ttyS0
```

That difference is the whole story. 24.04 boots **with an initrd**: `root=LABEL=...` can only be resolved by `blkid`/udev in userspace, so an initramfs is mandatory. And because that initramfs is built fat, it carries drivers for just about everything:

```shell
grep -r '^MODULES=' /etc/initramfs-tools/initramfs.conf /etc/initramfs-tools/conf.d/ 2>/dev/null
# /etc/initramfs-tools/initramfs.conf:MODULES=most
```

`MODULES=most` means every disk driver - including AHCI/SATA - is present at boot. So no problem finding the root disk, whatever bus it lives on.

26.04 is different: it boots **initrdless** and identifies disks by PARTUUID (the kernel can resolve a partition-table UUID on its own, no userspace needed). The catch is in my code: I was attaching the image with the `-hda` argument, which lands the disk on the q35 AHCI/SATA controller. On 24.04 that worked because the fat initramfs included the AHCI driver. On 26.04 there's no such luck - AHCI is a module, not built in, and there's no initramfs to load it from:

```shell
grep -E 'CONFIG_VIRTIO_BLK|CONFIG_SATA_AHCI|CONFIG_ATA=' /boot/config-$(uname -r)
# CONFIG_VIRTIO_BLK=y
# CONFIG_ATA=y
# CONFIG_SATA_AHCI=m
# CONFIG_SATA_AHCI_PLATFORM=m
```

`CONFIG_SATA_AHCI=m` (a module) versus `CONFIG_VIRTIO_BLK=y` (built in) is the crux. With no initramfs, only the built-in drivers exist - so a virtio disk is reachable but a SATA one is not.

## The fix

The lesson: load the disk with a driver that's always available on every image - virtio-blk. So the change was to switch from the `-hda` argument to a virtio drive:

```go
args = append(args, "-drive", fmt.Sprintf("file=%s,if=virtio,format=qcow2", imagePath))
```

With that, the OS image comes up as `vda`, the kernel finds `root=PARTUUID=...` with no initramfs required, and the guest boots on every release. The fix landed in [PR #19](https://github.com/q-controller/qemu-client/pull/19).

## Takeaway

It's important to understand what you're actually booting. Some QEMU arguments aren't free choices - the guest image decides which disk bus actually works. Get the disk bus wrong and a perfectly good image won't boot.
