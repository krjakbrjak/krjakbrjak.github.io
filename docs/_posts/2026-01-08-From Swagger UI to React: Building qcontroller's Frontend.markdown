---

layout: post
title:  "From Swagger UI to React: Building qcontroller's Frontend"
date:   2026-01-08
categories:
- devops
- frontend
- virtualization
tags:
- react
- typescript
- websockets
- go
- ui
---

In previous articles, I introduced [qcontroller](https://github.com/q-controller/qcontroller), a powerful tool for managing the complete lifecycle of QEMU VM instances—creating, starting, stopping, and removing VMs with database-like operations.

While qcontroller's REST API worked well for automation, and Swagger UI provided basic interaction capabilities, the growing adoption revealed a critical pain point: managing VMs through Swagger UI was becoming increasingly tedious for daily operations. What started as a backend-focused project clearly needed a proper frontend.

I built the [qcontroller UI](https://github.com/q-controller/qcontroller-ui)—a React-based web interface that transforms VM management from a technical chore into an intuitive experience. After spending considerable time on infrastructure and backend development, returning to frontend work was a refreshing change that reminded me why I love building user-facing applications.

## TL;DR

Built a React frontend for qcontroller to replace cumbersome Swagger UI. Key highlights:

- **Tech stack**: React + TypeScript + Mantine + Vite for modern, maintainable development
- **Real-time updates**: WebSocket integration for live VM status changes and IP allocation
- **Code generation**: OpenAPI Generator for REST client + Protocol Buffers for WebSocket messages
- **Single binary distribution**: Go's `embed` directive bundles the entire React app into the executable
- **Result**: Users download one file and get both API and web interface with zero setup

<p align="center">
  <img src="/images/posts/From Swagger UI to React: Building qcontroller's Frontend/dashboard.png" alt="Simple dashboard"/>
</p>

## The Challenge: Beyond Basic CRUD Operations

The UI requirements seemed straightforward at first glance, but the devil was in the details. VM management operations naturally split into two domains:

**VM Image Management:**
- Upload custom VM images (crucial for development workflows)
- List available images with metadata
- Remove unused images to save storage

**VM Instance Lifecycle:**
- Create instances with complex configuration options
- Start, stop, and delete VMs
- Monitor real-time status changes
- Track resource allocation (IP addresses, ports, etc.)

The real complexity emerged from the parameters involved. Creating a VM isn't just clicking "start"—it involves networking configurations, resource allocation, storage options, and more. Each operation needed a thoughtful UI that could handle this complexity without overwhelming users.

## The Game Changer: Real-Time Updates

The most critical missing piece was live feedback. In the Swagger UI world, you'd make a request and manually refresh to see status changes. But VM operations are inherently asynchronous—starting a VM takes time, IP allocation happens dynamically, and status changes occur continuously.

This drove me to implement WebSocket-based event streaming in qcontroller itself. Now the UI could show real-time updates as VMs boot up, IP addresses get assigned, and operations complete. This single feature transformed the user experience from static and frustrating to dynamic and responsive.

## Tech Stack Decisions: Modern Tools for Modern Problems

Choosing the right frontend stack was crucial for both development speed and long-term maintainability.

**[React](https://react.dev/) + TypeScript**: The obvious choice for component-based UI development. React's virtual DOM model and extensive ecosystem made it perfect for building dynamic interfaces.

**[Mantine](https://mantine.dev/)**: After evaluating several component libraries, Mantine stood out for its high-quality, responsive components and excellent developer experience. Every component looked professional out of the box—crucial for a developer tool that needed to feel polished.

**[Vite](https://vitejs.dev/)**: Modern build tooling that feels lightning-fast compared to Webpack. The development server starts instantly, and hot module replacement actually works reliably.

The real elegance came from React's Context API for handling WebSocket connections. Instead of prop drilling or complex state management, the entire app could reactively update from a single WebSocket stream:

```ts
import { useEffect, useState } from 'react';
import { UpdatesContext } from '@/common/updates-context';

export function UpdatesProvider({ children, wsUrl }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      // Implementation
    };

    ws.onmessage = (event) => {
      // Implementation
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [wsUrl]);

  return (
    <UpdatesContext.Provider value={data}>{children}</UpdatesContext.Provider>
  );
}
```

And then, in your app entry point:

```ts
import React from 'react';
import ReactDOM from 'react-dom/client';
import { UpdatesProvider } from '@/common/updates-provider';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UpdatesProvider wsUrl="/ws">
      {/* App content */}
    </UpdatesProvider>
  </React.StrictMode>
);
```

## Code Generation: The API-First Approach

For the REST API communication, I leveraged [OpenAPI Generator](https://openapi-generator.tech/) to automatically generate TypeScript client code. This API-first approach eliminates the common frontend-backend synchronization problems and ensures type safety across the entire stack.

The async nature of VM operations presented an interesting challenge. While OpenAPI excels at describing synchronous REST operations, there's no standard way to describe WebSocket-based event streams. [AsyncAPI](https://www.asyncapi.com/) exists but didn't fit my specific needs, and I wanted to avoid the complexity of gRPC-Web proxies.

The solution was surprisingly elegant: using Protocol Buffers for WebSocket messages. With [ts-proto](https://github.com/stephenh/ts-proto), the WebSocket message handling became as type-safe as the REST API, with everything generated from `.proto` definitions. Only a few lines of WebSocket connection code needed to be written manually—the rest was generated and type-safe.

## The Deployment Game-Changer: Single Binary with Embedded UI

One of the most compelling aspects of this project turned out to be the deployment strategy. For qcontroller's specific use case—a tool that gets distributed as a standalone binary—this approach was a perfect match.

qcontroller is written in Go, which already provides excellent deployment characteristics: compile once, run anywhere, no runtime dependencies. Since the tool is designed to be downloaded and run directly by users, maintaining that simplicity was crucial. But how do you include a modern React application without breaking this elegant distribution model?

For most web applications, you'd have separate frontend and backend deployments, CDNs for static assets, or containerized solutions. But qcontroller needed to stay true to its "single binary" philosophy for easy adoption and maintenance.

Go's [`embed`](https://golang.org/pkg/embed/) directive provided the perfect solution for this specific requirement—the entire React build becomes part of the binary itself:

```go
package frontend

import (
  "embed"
  "net/http"
)

//go:embed generated/*
var webFS embed.FS

func Handler(basepath string) http.HandlerFunc {
  return func(w http.ResponseWriter, r *http.Request) {
    path := "generated/" + r.URL.Path[len(basepath):]
    if _, err := webFS.Open(path); err != nil {
      // Serve index.html for client-side routing
      http.ServeFileFS(w, r, webFS, "generated/index.html")
      return
    }
    http.ServeFileFS(w, r, webFS, path)
  }
}
```

For qcontroller's distribution model, this delivers exactly what's needed: users download one binary, run it, and immediately get both the API and UI. No configuration files, no separate setup steps, no version mismatches between frontend and backend components.

The maintenance benefits are significant too. There's no need to coordinate releases between multiple services, no asset versioning concerns, and no deployment complexity. Users always get a perfectly matched frontend and backend in a single download.

## Results: From Functional to Delightful

The transformation from Swagger UI to a custom React interface has been remarkable. What was once a series of API calls requiring manual status checks is now an intuitive dashboard with real-time updates. VM creation involves guided forms instead of raw JSON, and operations provide immediate visual feedback.

The development experience reinforced something I've always believed: when you choose the right tools, frontend development can be just as systematic and maintainable as backend work. The combination of TypeScript, code generation, and well-designed component libraries created a development workflow that felt as robust as my usual Go projects.

The qcontroller UI proves that developer tools don't have to sacrifice usability for power. With the right architecture and toolchain, you can build interfaces that are both technically sophisticated and genuinely pleasant to use.