---
layout: post
title:  "Introducing qcontroller: Declarative VM Management with QEMU and Go"
date:   2025-08-05
categories: jekyll update
---
{% assign network_utils = site.posts | where: "title", "Automating Bridge + TAP Networking with a Go Binary (No Bash, No Fuss)" | first %}
{% assign qapi = site.posts | where: "title", "QEMU QAPI Client for Go — Native Code-Gen Straight from QEMU" | first %}

Managing local virtual machines shouldn't require heavy tooling, brittle shell scripts, or overly complex setups.  
If you've ever kludged together shell scripts just to boot a test VM, you'll relate.
That’s why I built qcontroller — a lightweight yet powerful controller for managing QEMU-based VMs using Go, gRPC, and REST APIs.

## 💡 Why qcontroller?

VirtualBox and VMware felt too bloated or restrictive for my needs. I used Multipass a lot, but it would occasionally break or misbehave in frustrating ways — inconsistent states, full network ranges, unrecoverable crashes, etc.

I wanted:

- A reliable, minimal, and flexible VM controller
- Based on QEMU, which works everywhere (including Apple Silicon)
- Backed by APIs, not scripts
- Easy to extend and understand
- Built in Go, not C++ or Bash

Thus, qcontroller was born — a self-contained binary that orchestrates VMs declaratively and exposes gRPC/HTTP APIs for full control.
## 🧠 What is qcontroller?

`qcontroller` is a tool for managing QEMU-based VMs through a clean API. It has three main components:

- controller: Core lifecycle logic exposed via gRPC
- qemu: A low-level wrapper around the QEMU system binary
- gateway: Exposes a RESTful HTTP interface using gRPC-Gateway

You can launch, start, stop, and query VMs declaratively using JSON config files or REST/gRPC calls.

---

## 🔧 Architecture

![Architecture diagram](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/o9rrdo1t434v5x1pn57c.jpeg)

Each component plays a role:

- controller speaks Protobuf/gRPC and orchestrates VM lifecycle.
- qemu is responsible for actually running and managing VM processes.
- gateway is a REST API layer for HTTP clients and tools.

All communication is done via gRPC, and an OpenAPI schema is auto-generated for the REST interface.

> **Separation of Controller and QEMU**: It's important to note that the application was split into two  components: the controller and QEMU. This separation was necessary because the qemu command requires elevated privileges due to its use of networking features such as TAP on Linux and vmnet on macOS. To avoid granting elevated rights to the entire application, a minimal QEMU service was created. This service runs as root and is responsible solely for executing the qemu command. The controller, on the other hand, manages the virtual machine lifecycle and runs as a non-root user, ensuring a more secure and controlled execution environment.

## ⚙️ Key Features

- ✅ Cross-platform: Works on Linux and macOS
- 📡 API-driven: Full control via gRPC and REST (thanks to gRPC-Gateway)
- 🧱 Single static binary: Easy to deploy, distribute, and containerize
- 🗃️ Custom image upload: Use your own QEMU images to launch VMs
- 📜 OpenAPI docs: Rendered Swagger UI interface built-in
- 🔄 Extensible: Add features like snapshots or volumes easily
- 🧠 Declarative config: Describe your VM setup as a JSON file

---

## 🚀 Quick Start

Use the included `start.sh` script to spin everything up:

```shell
bash start.sh
```

This command will start all three components:
- ➜ gateway: `http://localhost:8080`
- ➜ qemu: `0.0.0.0:8008`
- ➜ controller: `0.0.0.0:8009`

Then hit the REST API (e.g. using swagger ui, that is hosted at `http://localhost:8080/v1/swagger/index.html`):


![swagger UI snapshot](https://dev-to-uploads.s3.amazonaws.com/uploads/articles/rmyaucjrtpif1rf1tw9b.png)

## 📦 Bring Your Own Image
One key motivation behind qcontroller is the ability to run _your own custom-built images_.
Build a base Ubuntu image with QEMU Guest Agent (QGA) using Packer, and then upload it (together with the ID) to qcontroller via the API:
```bash
curl -X POST localhost:8080/v1/images -F "file=@ubuntu/base" -F "id=base-image"
```
You can reference this image ID when launching VMs.
This enables workflows like:

1. CI/CD testing on specific environments
2. Ephemeral VM provisioning with consistent configs

## 🧪 Built with Go and Protobuf
Internally, qcontroller uses:
* protoc-gen-go, protoc-gen-go-grpc, grpc-gateway
* Auto-generated OpenAPI via gnostic
* Linting and formatting with golangci-lint
* Structured, typed configs backed by Protobuf

If you're a Go developer, extending it is trivial. Want to add snapshot support? Just define it in the .proto files and hook into the logic.

## 📚 Related Posts
This project builds on two prior posts I wrote:
1. [Automating Bridge-TAP Networking with a Go Binary (no bash, no fuss)]({{ network_utils.url }})
2. [QEMU QAPI Client for Go: Native Code Gen Straight From QEMU]({{ qapi.url }})

## 🔗 GitHub
Source code: [qcontroller](https://github.com/q-controller/qcontroller)
## 💬 Feedback?

I’d love to hear your thoughts, suggestions, or bug reports! Open a GitHub issue or drop a comment below 👇
Thanks for reading, and happy VM hacking 🧠💻
