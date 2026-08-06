---
layout: post
title: "Recording a Component Demo Without Recording Your Screen"
description: "Driving Chrome from Node with the DevTools Protocol to produce a reproducible animated demo for a README, and then doing the same with Playwright."
date: 2026-08-06
categories:
- frontend
- automation
tags:
- cdp
- playwright
- chrome
- automation
- frontend
---

When you publish a UI component, the README has one job before anything else: show what the component looks like. A props table tells people whether it can do what they need, but only a picture tells them whether they want it. An animation is better than a screenshot, because a large part of a component is its interactions: hover states, transitions, the way it responds to input.

The usual way to produce that animation is a screen recording. It works, but it has two problems. It takes real effort every time, and the result is never the same twice. Window size, cursor path, and timing all differ between takes. Six months later the component changes and the whole process has to be repeated by hand.

I prefer to automate things like this, so I looked for a way to generate the animation instead of performing it. The tool turned out to be one I already use every day: Chrome ships with a complete remote control interface.

## TL;DR

- The **Chrome DevTools Protocol** (CDP) is the interface DevTools itself uses to talk to the browser. It is a WebSocket.
- Driving the browser from a script makes the recording reproducible: fixed viewport, one screenshot per animation step, encoded with ffmpeg.
- Synthetic input events move no visible cursor, so the script injects one into the page.
- **Playwright** wraps the same protocol and removes the browser management. It is normally presented as a testing tool, but the job here is the same.
- Learning CDP first makes Playwright easier to understand, because its API maps onto protocol commands.
- The result is used in a [calendar component](https://github.com/krjakbrjak/calendar), implemented in [PR #15](https://github.com/krjakbrjak/calendar/pull/15/).

## The Chrome DevTools Protocol

Start Chrome with a debugging port and it runs a small HTTP server next to the browser:

```bash
<PATH_TO_CHROME_EXEC> \
  --headless=new --remote-debugging-port=9222 --user-data-dir=/tmp/prof about:blank
```

`http://127.0.0.1:9222/json/list` lists the debuggable targets, each with a `webSocketDebuggerUrl`. Connecting to one gives you the protocol: you send `{id, method, params}` and receive `{id, result}`, plus events the browser pushes on its own. Node has a global `WebSocket`, so a usable client is six lines in the REPL:

```js
var t = await (await fetch('http://127.0.0.1:9222/json/list')).json()
var ws = new WebSocket(t.find(x => x.type === 'page').webSocketDebuggerUrl)
ws.readyState
var id = 0, pending = new Map()
ws.onmessage = e => { var m = JSON.parse(e.data); if (m.id) { var f = pending.get(m.id); pending.delete(m.id); f(m.result) } else console.log('EV', m.method) }
var send = (method, params = {}) => new Promise(r => { var i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })) })
```

From there the browser is scriptable:

```js
await send('Page.enable')
await send('Page.navigate', { url: 'https://example.com' })
(await send('Runtime.evaluate', { expression: 'document.title', returnByValue: true })).result.value
```

Events arrive on the same socket once the relevant domain is enabled, which is a convenient way to observe what a page is doing:

```js
await send('Network.enable')
await send('Page.reload')
// EV Network.requestWillBeSent, EV Network.responseReceived, ...
```

The protocol covers far more than navigation. `Input.dispatchMouseEvent` and `Input.insertText` drive the mouse and keyboard, `Emulation.setDeviceMetricsOverride` fixes the viewport and device pixel ratio, `Page.printToPDF` renders a PDF, etc.

Chrome also serves its own schema at `/json/protocol`, which lists every domain and command. In practice the most convenient way to discover commands is to open DevTools, enable **Protocol monitor** under More tools, and interact with the page: every command DevTools sends is shown, so anything you can do by hand can be traced back to the protocol call behind it.

## Making the result reproducible

Automating the recording is only part of the goal. The other part is that repeated runs should produce the same file, and recording in real time does not: the result depends on how fast the machine responded. Instead of recording video, the script performs one animation step and takes one screenshot, so the frame count is determined by the code:

```js
const glide = async (from, to, steps) => {
    for (let i = 1; i <= steps; i += 1) {
        const t = i / steps;
        await moveTo(
            Math.round(from.x + (to.x - from.x) * t),
            Math.round(from.y + (to.y - from.y) * t),
        );
        await capture();
    }
};
```

`glide(first, last, 20)` always contributes twenty frames. The numbered PNGs are then encoded with ffmpeg:

```bash
ffmpeg -y -framerate 15 -i .frames/%04d.png -vf scale=620:-1:flags=lanczos -plays 0 -f apng demo.png
```

I chose animated PNG over GIF. It works in the same `<img>` tag, supports full colour rather than 256, and in this case the file was around six times smaller than the GIF it replaced.

## Drawing the cursor

Synthetic input has one property that is easy to miss: `Input.dispatchMouseEvent` moves the logical pointer, and the page reacts correctly, but nothing is drawn. Hover styles apply and elements respond, yet the screenshots show the interface changing with no cursor anywhere. The animation looks broken.

CDP can inject a script that runs before any page script in a document, which is enough to fix it. Add an element and expose two helpers:

```js
const drawCursor = () => {
    const cursor = document.createElement('div');
    cursor.style.cssText = [
        'position:fixed',
        'z-index:9999',
        'width:18px',
        'height:18px',
        'margin:-9px 0 0 -9px',
        'border-radius:50%',
        'background:rgba(28,35,49,.28)',
        'border:2px solid rgba(28,35,49,.65)',
        'pointer-events:none',
    ].join(';');

    const attach = () => {
        document.body.appendChild(cursor);
        globalThis.__cursor = (x, y) => {
            cursor.style.left = `${x}px`;
            cursor.style.top = `${y}px`;
        };
        globalThis.__press = (down) => {
            cursor.style.transform = down ? 'scale(.75)' : 'scale(1)';
        };
    };

    if (document.body) {
        attach();
    } else {
        document.addEventListener('DOMContentLoaded', attach);
    }
};
```

Register it so it runs in every new document:

```js
await send('Page.addScriptToEvaluateOnNewDocument', { source: drawCursor })
```

`pointer-events: none` keeps the element from intercepting the events it illustrates, and the negative margin centres it on the coordinate. Each real mouse call is then paired with a cosmetic one:

```js
const moveTo = async (x, y) => {
    await page.mouse.move(x, y);
    await page.evaluate(([px, py]) => globalThis.__cursor(px, py), [x, y]);
};
```

Clicks work the same way: scale the circle down on press and back up on release. The element is not the pointer, only a drawing of where it is, but it is what makes the recording readable.

## Using Playwright instead

All of the above is useful to know, and most of it is not worth writing yourself.

[Playwright](https://github.com/microsoft/playwright) wraps this protocol. It is usually introduced as a testing tool, which obscures how general it is: launching a browser, locating elements, moving a mouse and taking screenshots is the same work whether or not the result is an assertion.

| Hand-written CDP | Playwright |
|---|---|
| spawn Chrome, poll `DevToolsActivePort`, fetch `/json/list`, open a WebSocket | `chromium.launch({ executablePath })` |
| id counter, pending map, listener list, `send` and `once` | not needed |
| `Emulation.setDeviceMetricsOverride` | `browser.newPage({ viewport, deviceScaleFactor })` |
| `Page.navigate` plus waiting for `Page.loadEventFired` | `page.goto(url)` |
| `Runtime.evaluate` with `getBoundingClientRect` | `locator.boundingBox()` |
| three `Input.dispatchMouseEvent` calls per click | `page.mouse.down()` and `page.mouse.up()` |
| `Page.captureScreenshot`, base64 decode, write file | `page.screenshot({ path })` |
| `Page.addScriptToEvaluateOnNewDocument` | `page.addInitScript(fn)` |
| signal handlers, temporary profile directory, cleanup | `browser.close()` |

One part improved beyond the line count: `addInitScript` accepts a function rather than source text, so the injected cursor code is linted and formatted like the rest of the project instead of living inside a string.

I used `playwright-core` rather than `playwright`. The full package downloads its own browser builds; the core package ships none and accepts an `executablePath`, which matches how the script already received the Chrome path.

The order in which I did this turned out to be useful. Starting from the protocol meant that the Playwright API was never opaque: `addInitScript` is `Page.addScriptToEvaluateOnNewDocument`, and when something behaves unexpectedly it is clear which protocol command to inspect in Protocol monitor. Understanding the layer below an abstraction does not stop being valuable once you adopt the abstraction.

## Conclusion

A demo animation can be a build artifact. A single command drives a headless browser through a scripted interaction, captures the frames, and encodes them. It produces the same file on any machine, and when the component changes the animation is regenerated rather than re-recorded. A working implementation is in [PR #15](https://github.com/krjakbrjak/calendar/pull/15/).

The wider point concerns where automation tools are considered applicable. Browser automation is categorised as testing, so tasks such as producing a demo animation stay in the manual bucket next to screen recording and video editing. There is no technical reason for that. If the task happens in a browser and the steps can be described, it can be automated, and the benefit is not only the time saved but that the output becomes reproducible.
