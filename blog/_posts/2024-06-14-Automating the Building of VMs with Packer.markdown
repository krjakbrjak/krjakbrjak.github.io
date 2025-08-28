---
layout: post
title:  "Automating the Building of VMs with Packer"
date:   2024-06-14
categories:
- devops
- automation
tags:
- packer
- vm
- devops
- infrastructure
---

## Introduction

There are many reasons why one might need a VM, for example:

1. **Learning new tools** like [Kubernetes](https://kubernetes.io/) and explore different ways of installing it, experimenting with various plugins, etc. If these tools are installed natively on the host and something goes wrong, it might require resetting the host.
2. **Creating clean, reproducible builds** for your project.

Setting up the VM and all the necessary tools usually takes time and effort. Automating this process would be much faster, more convenient, and significantly less error-prone. While one can write scripts to set up VMs, this approach requires new implementations for each virtualization software technology. Various tools exist for this purpose, but I am going to use [Packer](https://www.packer.io/) because it is open source, widely adopted, and well-supported. It supports all modern VM providers, such as [VirtualBox](https://www.virtualbox.org/), [VMware](https://www.vmware.com/), [KVM](https://linux-kvm.org/page/Main_Page), and various cloud providers. It is also highly configurable and can be extended if you need functionality not yet supported by the tool.

Another important tool from the same organization is [Vagrant](https://www.vagrantup.com/), which provides extra help in running VMs built with Packer. Of course, the choice of a VM provider is also very important, as some VM providers may not be supported on certain platforms. For example, there are no VMware or VirtualBox releases that support Apple Silicon. However, [QEMU](https://www.qemu.org/) is supported on most platforms, including Apple Silicon, which is why this provider was chosen here.

The next important question is choosing the Linux distro. One of the most popular Linux distros is [Ubuntu](https://ubuntu.com/), which will be considered here.

## Unattended installation

Traditionally, to support unattended installations, so-called _preseed files_ were used. However, in recent releases, these have been deprecated in favor of [autoinstall](https://canonical-subiquity.readthedocs-hosted.com/en/latest/intro-to-autoinstall.html), a tool that allows for unattended OS installations with the help of cloud-init. Instead of booting an ISO image and manually selecting options, one can describe the system installation in a YAML file (the reference can be found here) and boot the system with specific options. Internally, cloud-init will start and check for special files, meta-data, and user-data, in the specified location. The only drawback is that this solution is available for server releases. However, here is a [link](https://github.com/canonical/autoinstall-desktop/blob/main/README.md) to official Canonical user-data files that can be used as a reference for installing the desktop environment.
The following is an example of `user-data` that was used to prepare the server:

```yaml
#cloud-config
autoinstall:
  version: 1
  locale: en_US
  network:
    version: 2
    ethernets:
      all:
        match:
          name: en*
        dhcp4: true
  ssh:
    install-server: yes
    allow-pw: yes
  user-data:
    ssh_pwauth: True
    users:
      - name: packer
        plain_text_passwd: packer
        sudo: ALL=(ALL) NOPASSWD:ALL
        shell: /bin/bash
        groups: sudo
        lock_passwd: false
```

It has a very basic structure where basically only the user is specified. Extra packages can be added here as well, like compiler toolchain, etc. The full reference for the format of this file can be found [here](https://canonical-subiquity.readthedocs-hosted.com/en/latest/reference/autoinstall-reference.html). What is worth mentioning here is the network configuration. When network configuration is not specified here then (on my system) the wrong configuration is added automatically, that does not match any interface. That is why a match for all Ethernet interfaces (`en*`) was added. See [this](https://github.com/systemd/systemd/blob/ccddd104fc95e0e769142af6e1fe1edec5be70a6/src/udev/udev-builtin-net_id.c#L29) for more information about predictable interface names.

After that the only thing that is left to do is to tell `autoinstall` where this configuration files can be found. With Packer it is very easy as it will start this server automatically. The following is the relevant part of the packer build config:

```hcl
  http_directory = "http"
  boot_command = [
    "c",
    "linux /casper/vmlinuz --- autoinstall ds='nocloud-net;s=http://{% raw %}{{ .HTTPIP }}:{{ .HTTPPort }}{% endraw %}/' ",
    "<enter><wait>",
    "initrd /casper/initrd<enter><wait>",
    "boot<enter>"
  ]
```

Packer will automatically start an HTTP server and substitute the IP and port in the boot command. The server will serve files from the root (`/`). You have two options for providing the `autoinstall` configuration files:

1. Place the files (`user-data`, `meta-data`, etc.) in the same folder as your Packer manifest and set `http_directory` to point to that folder.
2. Define the files directly in your Packer manifest using the `http_content` option, for example:

  ```hcl
  http_content = {
    "/meta-data" = <<EOF
    EOF
    "/user-data" = <<EOF
    # Paste your configuration here
    EOF
  }
  ```

Both approaches will make the configuration files available to the installer via HTTP, allowing for unattended installation.
While the server image approach works well, it can be quite large and configuring autoinstall with custom boot commands can be cumbersome and error-prone. For a more streamlined experience, Ubuntu provides [cloud images](https://cloud-images.ubuntu.com/) that are specifically optimized for cloud environments. These images are lightweight, come with `cloud-init` pre-installed, and make unattended installations much simpler. With cloud images, you can leverage the flexibility and simplicity of `cloud-init` to automate OS setup without the need for complex boot commands or manual configuration steps. According to the [documentation](https://cloudinit.readthedocs.io/en/latest/reference/datasources/nocloud.html),

> the data source `NoCloud` allows the user to provide user-data and meta-data to the instance without running a network service (or even without having a network at all).

`meta-data` can be passed via SMBIOS “serial number” option. Since QEMU builder is used here, the `cloud-init` config can be passed via `-smbios` option (relevant part of a packer template):

```hcl
  qemuargs = [
    ["-smbios", "type=1,serial=ds=nocloud-net;s=http://{% raw %}{{ .HTTPIP }}:{{ .HTTPPort }}{% endraw %}/cloud/"]
  ]
```
 
Finally, after the VMs images were prepared and built it is time to start them. ANd to make it easy, a template `Vagrantfile` is generated with the help of [`shell-local`](https://developer.hashicorp.com/packer/docs/post-processors/shell-local) post-processor:

```ruby
Vagrant.configure(2) do |config|
  config.vm.box = "${var.vm_name}.box"
  config.vm.provider :qemu do |qe, override|
    override.ssh.username = "packer"
    override.ssh.password = "packer"
    qe.qemu_dir = "${var.qemu_dir}"
    qe.arch = "${var.qemu_arch}"
    qe.machine = "type=${var.machine},accel=${var.accelerator}"
    qe.cpu = "host"
    qe.net_device = "virtio-net"
    qe.smp = 4
    qe.memory = "8192M"
    qe.ssh_port = "${var.qemu_ssh_port}"
  end
  config.vm.synced_folder ".", "/vagrant", disabled: true
end
```

All that is left to do is go the build folder and type `vagrant up`.

You can find the complete code used in this article [here](https://github.com/krjakbrjak/packer_templates/tree/main).

## Conclusion
Packer is a powerful and versatile tool for automating the creation of virtual machine images. Its compatibility with a wide range of platforms and VM providers makes it a valuable asset for any developer. Whether you are looking to learn new technologies, ensure clean and reproducible builds, or streamline the system setup process, Packer can significantly enhance your workflow.
