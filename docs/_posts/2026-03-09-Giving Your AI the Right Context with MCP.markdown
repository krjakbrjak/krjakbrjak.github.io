---

layout: post
title: "Giving Your AI the Right Context with Model Context Protocol (MCP)"
description: "How to build a small MCP server in Go that lets AI models discover and query your data directly, replacing manual copy-pasting with structured tool calls."
date: 2026-03-09
categories:
- ai
- tooling
tags:
- mcp
- llm
- go
- claude
---

Nowadays, pretty much everyone works with AI one way or another. Whether it's writing code, debugging, designing infrastructure — LLMs have pushed our productivity to yet another level. But here's the thing: in order to utilize their power more efficiently, we can actually help them be more efficient. That's where the Model Context Protocol (MCP) comes in — and in this post, I'll show how to build a simple MCP server in Go.

## The Problem

Say you're working on a backend. You have your data — maybe a database, maybe an API — and you want to think about what kind of interface or tooling you could build around it. You open your favorite AI assistant and start describing your data structures. "I have a books table with id, title, author, and a loans table that references..." — you get the idea. It works, but it's tedious. You're essentially doing the model's homework.

Why not just let it look at the data directly?

For a small service without authentication, sure — you could point it at an endpoint and say "fetch some data, see its structure." But imagine you're working on something bigger. Something behind authentication layers, internal APIs, complex data relationships. You can't just hand the model a URL and hope for the best.

Instead, you could build a small application that sits between the model and your backend — something that knows how to pull the data and explain its shape to the model. The model calls your app, your app talks to the backend, and the model gets exactly the context it needs.

You get the idea. If only there was a standard protocol for this...

## What is Model Context Protocol (MCP)?

It's called the [Model Context Protocol (MCP)](https://modelcontextprotocol.io), designed by Anthropic. And it's exactly what you'd want.

MCP defines a standard way for AI models to discover and call external tools. Your app becomes an MCP server — it advertises what it can do (search, fetch, create, whatever), and the model calls those tools when it needs context. No more manual copy-pasting. No more describing your data schema in a chat window.

## A Simple Example: Library Catalog

To see how this works in practice, I built a tiny MCP server in Go — a library catalog. Two tools: search books and get book details.

Here's the MCP server configuration (`.mcp.json`), placed in the root of your workspace. This file defines MCP servers that provide additional context and capabilities to the AI client (e.g. Claude Code):

```json
{
  "mcpServers": {
    "library": {
      "command": "./mcp-library",
      "args": []
    }
  }
}
```

And the server itself — using the [official Go SDK](https://github.com/modelcontextprotocol/go-sdk):

```go
server := mcp.NewServer(&mcp.Implementation{
    Name:    "library-mcp",
    Version: "1.0.0",
}, nil)

server.AddTool(
    &mcp.Tool{
        Name:        "search_books",
        Description: "Search the library catalog. Returns matching books.",
        InputSchema: json.RawMessage(`{
            "type": "object",
            "properties": {
                "title":  {"type": "string", "description": "Filter by book title."},
                "author": {"type": "string", "description": "Filter by author name."}
            }
        }`),
    },
    func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
        args := parseArgs(req)
        result, err := searchBooks(ctx, str(args, "title"), str(args, "author"))
        return textResult(result, err)
    },
)

server.AddTool(
    &mcp.Tool{
        Name:        "get_book",
        Description: "Get full details for a book by its ID, including loan history.",
        InputSchema: json.RawMessage(`{
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "The book ID."}
            },
            "required": ["id"]
        }`),
    },
    func(ctx context.Context, req *mcp.CallToolRequest) (*mcp.CallToolResult, error) {
        args := parseArgs(req)
        result, err := getBook(ctx, str(args, "id"))
        return textResult(result, err)
    },
)

if err := server.Run(context.Background(), &mcp.StdioTransport{}); err != nil {
    log.Fatal(err)
}
```

Each tool declares its name, description, and input schema — this is what the model sees. When the model decides it needs to search for books by Tolkien, it calls `search_books` with `{"author": "Tolkien"}`. The server does the lookup and returns the results. The model never had to be told what the data looks like — it discovered and queried it on its own.

## What This Looks Like in Practice

With this MCP server running, I can open Claude Code in my project directory and just have a conversation:

> Are there any books by Tolkien?

The model picks up the `search_books` tool, calls it with the right filter, and comes back with the results. No prompting gymnastics. No pasting JSON blobs. It just works.

<p align="center">
  <img src="/images/posts/Giving Your AI the Right Context with MCP/mcp-example.png" alt="Claude Code using an MCP server to search a library catalog"/>
</p>

And the best part — this is a trivial example with hardcoded data. Replace the mock data with actual database queries or API calls to your production backend, and you've got yourself an AI assistant that truly understands your system.

## Conclusion

MCP bridges the gap between what the model can do and what it knows about your specific context. Instead of explaining your world to the model, you give it the tools to explore it. The protocol is open, the SDKs are available in multiple languages, and the integration with tools like Claude Code is already there.

If you're building anything where an LLM could benefit from knowing your data — and let's be honest, that's most things these days — MCP is worth looking into.

The full source code for this example is available [here](https://gist.github.com/krjakbrjak/d8522e7c6f969305141e91e8523bf31c).
