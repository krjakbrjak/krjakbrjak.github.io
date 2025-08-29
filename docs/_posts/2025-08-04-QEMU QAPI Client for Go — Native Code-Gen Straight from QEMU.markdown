---
layout: post
title:  "QEMU QAPI Client for Go — Native Code-Gen Straight from QEMU"
date:   2025-08-04
categories:
- linux
- virtualization
- automation
tags:
- go
- qemu
- code generation
- vm
- devops
- infrastructure
---

## Ever glued together socat, raw JSON, and a prayer just to talk to QEMU from Go?
I did—until one missing comma killed an overnight CI run. So I bolted a Go backend onto QEMU’s own QAPI generator, and now every VM call is type-safe, fully async, and always in sync with upstream. ➡️ [Check out the project on GitHub](https://github.com/q-controller/qapi-client)

## Why I Built This
QEMU already ships a rich JSON interface (QAPI), yet Go developers still end up:
* Writing raw JSON by hand – easy to mistype, hard to test.
* Chasing partial wrappers – most cover only “common” commands.
* Fixing silent schema drift.

## What You Get
* Fully typed bindings for every command, struct, and enum in qapi-schema.json.
* Async events & requests via goroutines and channels—no polling loops.
* Transport helpers for QMP, QGA, serial pipes, TCP, stdio… the lot.
* Schema-sync guarantee – regenerate on each QEMU bump; drift becomes impossible.

The generated Go code is structured per schema module and works out of the box with a reusable core client.

## 🚀 Example
* Generate Go bindigs:

```shell
./generate.sh --schema qemu/qapi/qapi-schema.json \
    --out-dir generated --package qapi
```

* Use the generated client in Go:

    ```go
    monitor, monitorErr := client.NewMonitor()
    if monitorErr != nil {
        return monitorErr
    }

    defer monitor.Close()
    msgCh := monitor.Start()

    monitor.Add("example instance", socketPath)
    if req, reqErr := qapi.PrepareQmpCapabilitiesRequest(qapi.QObjQmpCapabilitiesArg{}); reqErr == nil {
        if ch, chErr := monitor.Execute("example instance", client.Request(*req)); chErr == nil {
            res := <-ch // capabilities negotiated
        }
    }
    ```

* Listen to events:

    ```go
    for msg := range msgCh {
        log.Printf("event: %+v\n", msg)
    }
    ```

Because every struct and enum comes straight from the schema, your IDE autocompletes everything, and compile-time checks catch mismatched fields long before QEMU ever sees the request.

A runnable sample lives in [/example](https://github.com/q-controller/qapi-client/tree/main/example).

## Bonus: Custom QEMU Builds Welcome

Running a patched QEMU with extra QAPI entries? No problem—point the generator at your fork’s qapi-schema.json and commit the result. Add one GitHub Actions step:

```yaml
- name: Regenerate QAPI bindings
  run: |
    ./generate.sh \
      --schema ./qemu-fork/qapi/qapi-schema.json \
      --out-dir ./generated \
      --package qapi
  shell: bash
```

If the schema changes, the action yields a clean diff and your pull request instantly shows whether anything downstream breaks.

## Wrapping Up
Stop juggling JSON and second-guessing upgrades—let QEMU’s own generator keep your Go client perfectly aligned. Star the repo, open an issue, or submit a PR if you spot something missing. Your VMs (and future, better-rested self) will thank you.
