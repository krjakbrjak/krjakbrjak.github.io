---
layout: post
title:  "Setting Up a Simple Two-Node Kubernetes Cluster in No Time"
date:   2025-01-15
categories:
- devops
- infrastructure
tags:
- kubernetes
- devops
- linux
---

Kubernetes is now a crucial tool for developers. Regardless of the field of software development, Kubernetes will likely be involved. Even if you're not directly working on a service that must run in a Kubernetes environment, at some point you'll likely need to add a CI pipeline to a project, and that CI tool (e.g., Jenkins) will likely be deployed in Kubernetes. Therefore, it's important to quickly install Kubernetes for your needs. Of course, Kubernetes is a large tool with many details, which must be explored case by case. Additionally, the official Kubernetes documentation is the best source of information and helps immensely in resolving any questions. In this post, I will describe the necessary steps to install a basic two-node (control plane and worker) Kubernetes cluster.

## Prerequisites

Before beginning the installation and configuration of the Kubernetes cluster, you must install the necessary tools on the system. 

_**Container runtime**_

Since Kubernetes is a containerized environment, the first thing that needs to be installed is a container runtime. A container runtime is essential for a Kubernetes cluster because it manages the containers that Kubernetes orchestrates. Without it, Kubernetes cannot execute workloads or manage containerized applications. In this example, I'll be using [containerd](https://containerd.io/).

To ensure containerized workloads function correctly, the `overlay` and `br_netfilter` kernel modules must be loaded:

- **overlay**: Enables the overlay filesystem, which container runtimes use to manage container layers efficiently.
- **br_netfilter**: Allows bridge networks to integrate with the Netfilter framework, enabling Kubernetes to manage inter-pod and external communications via iptables.

Run the following to load these modules:

```bash
sudo modprobe overlay
sudo modprobe br_netfilter
```
To ensure proper Kubernetes networking, configure specific sysctl parameters:

- **Packet Forwarding** (net.ipv4.ip_forward): Enables routing of traffic between pods and external networks.
- **Bridge Netfilter Rules** (net.bridge.bridge-nf-call-iptables and net.bridge.bridge-nf-call-ip6tables): Ensures iptables processes bridged traffic, which is essential for pod-to-pod and pod-to-external communication.

Configure and apply these parameters:

```bash
sudo tee /etc/sysctl.d/99-kubernetes-cri.conf <<EOF
net.bridge.bridge-nf-call-iptables = 1
net.ipv4.ip_forward = 1
net.bridge.bridge-nf-call-ip6tables = 1
EOF
sudo sysctl --system
```

Next, download, install, and configure containerd with the following commands:

```bash
CONTAINERD_VERSION=$(curl -s https://api.github.com/repos/containerd/containerd/releases/latest | jq -r '.tag_name')
CONTAINERD_VERSION=${CONTAINERD_VERSION#v}
curl -s -LO https://github.com/containerd/containerd/releases/download/v${CONTAINERD_VERSION}/containerd-${CONTAINERD_VERSION}-linux-${PLATFORM}.tar.gz
sudo tar xf containerd-${CONTAINERD_VERSION}-linux-${PLATFORM}.tar.gz -C /usr/local

sudo mkdir -p /etc/containerd
cat <<- EOF | sudo tee /etc/containerd/config.toml > /dev/null
version = 2
[plugins]
    [plugins."io.containerd.grpc.v1.cri"]
        [plugins."io.containerd.grpc.v1.cri".containerd]
            discard_unpacked_layers = true
            [plugins."io.containerd.grpc.v1.cri".containerd.runtimes]
                [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc]
                    runtime_type = "io.containerd.runc.v2"
                    [plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
                        SystemdCgroup = true
EOF

RUNC_VERSION=$(curl -s https://api.github.com/repos/opencontainers/runc/releases/latest | jq -r '.tag_name')

curl -s -L https://github.com/opencontainers/runc/releases/download/${RUNC_VERSION}/runc.${PLATFORM} -o runc.${PLATFORM}
sudo install -m 755 runc.${PLATFORM} /usr/local/sbin/runc

# Restart containerd
curl -s -L https://raw.githubusercontent.com/containerd/containerd/main/containerd.service -o containerd.service
sudo mv containerd.service /usr/lib/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now containerd
```

_**Kubetools**_

Next, we need to install the necessary Kubernetes tools:

- **kubeadm**: The tool used to install the Kubernetes cluster.
- **kubectl**: The tool used to interact with the cluster (e.g., run pods, etc.).
- **kubelet**: The Kubernetes agent that runs on each node in the cluster. Without kubelet, a node cannot join or function in a Kubernetes cluster.

The [official documentation](https://kubernetes.io/docs/tasks/tools/) describes different installation methods. In this case, we'll use the manual installation:

```bash
RELEASE="$(curl -sSL https://dl.k8s.io/release/stable.txt)"
pushd /usr/local/bin
sudo curl -L --remote-name-all https://dl.k8s.io/release/${RELEASE}/bin/linux/${PLATFORM}/{kubeadm,kubelet,kubectl}
sudo chmod +x {kubeadm,kubelet}
popd

RELEASE_VERSION="v0.16.2"
curl -sSL "https://raw.githubusercontent.com/kubernetes/release/${RELEASE_VERSION}/cmd/krel/templates/latest/kubelet/kubelet.service" | sed "s:/usr/bin:/usr/local/bin:g" | sudo tee /usr/lib/systemd/system/kubelet.service
sudo mkdir -p /usr/lib/systemd/system/kubelet.service.d
curl -sSL "https://raw.githubusercontent.com/kubernetes/release/${RELEASE_VERSION}/cmd/krel/templates/latest/kubeadm/10-kubeadm.conf" | sed "s:/usr/bin:/usr/local/bin:g" | sudo tee /usr/lib/systemd/system/kubelet.service.d/10-kubeadm.conf
```
In addition to installing kubelet and kubectl, we must configure the [runtime-endpoint](https://kubernetes.io/docs/tasks/debug/debug-cluster/crictl/) so Kubernetes can communicate with the container runtime, ensuring proper container management on each node. For this, the crictl tool needs to be installed:

```bash
CRICTL_VERSION=$(curl -s https://api.github.com/repos/kubernetes-sigs/cri-tools/releases/latest | jq -r '.tag_name')
CRICTL=crictl-${CRICTL_VERSION}-linux-${PLATFORM}.tar.gz
curl -s -LO "https://github.com/kubernetes-sigs/cri-tools/releases/download/${CRICTL_VERSION}/${CRICTL}"
sudo tar -C /usr/local/bin -xz -f ${CRICTL}
sudo crictl config --set \
        runtime-endpoint=unix:///run/containerd/containerd.sock
```

## K8s installation

Now that all the necessary tools are installed, we can set up the Kubernetes cluster. As mentioned, we will configure a 2-node cluster: one control plane node and one worker node. These will be two separate VM instances, so make sure to run the previous commands on both instances.

- **Control Plane Node**: Manages the cluster and runs components like the API server, controller manager, and scheduler.
- **Worker Node**: Runs applications (pods) and manages containers. It includes components like kubelet, container runtime, and kube-proxy.

Separating the control plane and worker nodes ensures scalability, fault tolerance, and improved performance. Control plane components are resource-intensive and need isolation from application workloads, while worker nodes handle the containerized applications. This separation improves stability and security.

The installation of Kubernetes is straightforward. First, configure the control plane and then join the worker node.

```bash
sudo kubeadm init

# Configure kubectl
mkdir -p $HOME/.kube
sudo cp -i /etc/kubernetes/admin.conf $HOME/.kube/config
sudo chown $(id -u):$(id -g) $HOME/.kube/config

# Install network plugin
kubectl apply -f https://docs.projectcalico.org/manifests/calico.yaml
```

In this example, we install the [Calico](https://docs.tigera.io/calico/latest/about/) network plugin. Once this is done, the worker node must join the control plane. The join command can be retrieved by running the following on the control plane node:

```bash
kubeadm token create --print-join-command
```

Copy and run the command on the worker node (with sudo).

And that’s it! Your Kubernetes cluster is up and running.
