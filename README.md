# Tachikoma MCP Server

Code intelligence for your AI assistant — semantic search, impact analysis, rename refactoring, wiki generation. Powered by the tachikoma knowledge graph.

## What it does

This extension registers a [Model Context Protocol](https://modelcontextprotocol.io) server that gives your AI assistant (Copilot Chat, Claude, etc.) access to tachikoma code intelligence tools.

## Tools

| Tool | Description |
|------|-------------|
| `query` | Search the knowledge graph for execution flows |
| `context` | 360° view of a symbol: callers, callees, processes |
| `impact` | Blast radius analysis — what breaks if you change a symbol |
| `detect_changes` | Map git diff to indexed symbols and flows |
| `rename` | Safe rename with call graph awareness |
| `wiki` | Generate docs from the knowledge graph |
| `processes` | List all traced execution flows |
| `communities` | Functional areas via graph clustering |
| `route_map` | All HTTP routes with handlers |
| `cypher` | Raw queries against the knowledge graph |

## Setup

1. Install this extension
2. Connect to your tachikoma computer via the [Tachikoma Collab](https://marketplace.visualstudio.com/items?itemName=Tachikoma.tachikoma-collab) extension
3. The MCP server auto-detects your session

Or set environment variables manually:

```
TACHIKOMA_SSE_URL=http://your-server:8000/api/mcp/sse
TACHIKOMA_TOKEN=your-jwt-token
```

## Requirements

- A running tachikoma server with indexed repositories
- Node.js 18+
