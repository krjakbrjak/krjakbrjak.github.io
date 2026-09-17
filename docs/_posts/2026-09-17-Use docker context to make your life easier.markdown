---
layout: post
title: "Use docker context to make your life easier"
description: "Running several Compose projects on one machine means port conflicts and containers you can't safely kill. Moving each project into its own VM and reaching it through a docker context fixes both - without ever typing ssh."
date: 2026-09-17
categories:
- devops
- containers
tags:
- docker
- devops
- qemu
- virtualization
- infrastructure
---
{% assign snapshots = site.posts | where: "title", "VM Snapshots in qcontroller: Go Back to When Everything Worked" | first %}

Quite often I find myself working on several projects at the same time, and each of them has some sort of Docker Compose deployment - at least for development. That works fine until two of them want the same port. Then you start adjusting manifests, overriding variables, renaming things, and a lot of effort goes into something that should be effortless.

The other situation is worse. At some point there are so many containers running that debugging anything is hopeless, and you just want to kill them all - except one stack has to stay up. So the blunt `docker rm -f $(docker ps -aq)` is off the table, and now you have to figure out which containers belong to which project. In theory that's `docker compose down` per project. In practice you first have to find the projects: `docker compose ls`, match the names back to directories, and with a couple of overlays in play the name is often not what you'd guess, because `-p`, `COMPOSE_PROJECT_NAME` and a `name:` in any of the files all get a say. Run `down` with a different set of `-f` files than you ran `up` with and you leave networks and volumes behind. It's all doable, it's just not what you want to be doing at the moment you actually need to focus on something.

I found myself in this situation often enough, and the solution turned out to be a Docker feature I knew about for years but somehow never gave a chance to show itself: **docker context**.

## One VM per project

The idea is simple: instead of running every Compose project on your laptop, give each one its own VM. I manage mine with [qcontroller](https://github.com/q-controller/qcontroller) - create a machine, set up SSH, install Docker inside. That's it.

The obvious objection: now you have to SSH into a machine every time you want to touch a container. That would be too much work. Remember, we are lazy - we're trying to get rid of one annoying problem, so better not create another one.

## Docker context

This is exactly what contexts are for. A context tells the Docker CLI which daemon to talk to, and that daemon doesn't have to be the local one. Create one per VM:

```shell
docker context create devbox1 --docker "host=ssh://docker@192.168.71.10"
docker context create devbox2 --docker "host=ssh://docker@192.168.71.11"
```

Activate one, and every `docker` command you run from now on goes to that VM's daemon:

```shell
docker context use devbox1
docker run --rm -it alpine # runs inside devbox1, i.e. docker@192.168.71.10
```

If you work with Kubernetes you do this all the time - switching `kubectl` contexts is routine, at least as an admin. Same idea here.

## Why a VM and not just another Compose project

Compose can namespace things on its own, so what does the machine boundary actually buy?

Mostly this: you stop having to know what belongs to what. `docker rm -f $(docker ps -aq)` is a perfectly safe command when the daemon it hits only ever runs one project, and no amount of overlay trickery can move containers from one host to another. The port problem goes away for the same reason - both stacks can bind `8080`, because they're binding it on different machines.

There is a bonus, too. You can cap the VM's CPU and memory to roughly what the project gets in production. Docker can limit containers as well, of course, but the VM boundary also catches whatever the project spawns *outside* a container - a build, a language server, some stray process from a Makefile. And once a project lives in a VM, you get [snapshots]({{ snapshots.url }}) for free: roll the whole machine back to just before you broke it, instead of unpicking what changed.

## Caveats

**`docker context use` is global.** It's written to your Docker config, so it survives across shells and reboots. Forget to switch back to `default` and you'll spend a confused minute wondering where your local containers went. The `DOCKER_CONTEXT` environment variable is the better tool - set it for a single command, or for a shell, and it doesn't touch the active context at all:

```shell
DOCKER_CONTEXT=devbox1 docker compose up -d
```

`docker context show` tells you which one is active right now.

**SSH won't ask you for credentials.** The Docker CLI doesn't prompt, so with password authentication - or a key with a passphrase - the connection simply fails. `ssh-agent` and the usual helpers solve it:

* key with a passphrase: `ssh-add ~/.ssh/id_ed25519` once per session
* password authentication: `ssh-copy-id docker@192.168.71.10` once, and you're on keys from then on

**The daemon is on the other machine, and so is everything it touches.** Bind mounts resolve on the daemon's filesystem, so `- ./src:/app` looks for `./src` inside the VM, not on your laptop - and a live-reload mount is usually the whole reason the Compose file exists at development time. Build contexts get tarred up and sent over SSH on every build. Published ports end up on the VM's IP, so `localhost:8080` becomes `192.168.71.10:8080`.

None of this is a dealbreaker - you get the source tree into the VM once, by whatever means you prefer, and carry on. But it's the first wall you hit, so it's worth deciding how the code gets there before you move a project across.

## Conclusion

Port conflicts and "which of these can I kill" are small problems, but they always hit at the worst possible moment. One VM per project makes them go away, and `docker context` makes the isolation free at the point of use: the containers are on another machine, but the commands are the same ones you'd have typed anyway.
