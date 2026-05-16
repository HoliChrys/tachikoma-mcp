# Tachikoma MCP Server

Code intelligence for your AI assistant — semantic search, impact analysis, rename refactoring, wiki generation. Powered by the tachikoma knowledge graph.

[![Install in VS Code](https://img.shields.io/badge/VS_Code-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22tachikoma%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22tachikoma-mcp-server%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode-insiders:mcp/install?%7B%22name%22%3A%22tachikoma%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22tachikoma-mcp-server%22%5D%7D)

## What it does

This registers a [Model Context Protocol](https://modelcontextprotocol.io) server that gives your AI assistant (Copilot Chat, Claude, etc.) access to tachikoma code intelligence tools.

## Tools

| Tool | Description |
|------|-------------|
| `query` | Search the knowledge graph for execution flows |
| `context` | 360-degree view of a symbol: callers, callees, processes |
| `impact` | Blast radius analysis — what breaks if you change a symbol |
| `detect_changes` | Map git diff to indexed symbols and flows |
| `rename` | Safe rename with call graph awareness |
| `wiki` | Generate docs from the knowledge graph |
| `processes` | List all traced execution flows |
| `communities` | Functional areas via graph clustering |
| `route_map` | All HTTP routes with handlers |
| `cypher` | Raw queries against the knowledge graph |
| `list_repos` | List indexed repositories |
| `shape_check` | Verify symbol type shapes |
| `api_impact` | Cross-repo API impact via contract matching |

## Setup

1. Click the install badge above, or search "tachikoma-mcp" in VS Code extensions
2. Connect to your tachikoma computer via the [Tachikoma Collab](https://marketplace.visualstudio.com/items?itemName=Tachikoma.tachikoma-collab) extension
3. The MCP server auto-detects your session from `~/.tachikoma/mcp-session.json`

Or set environment variables:

```
TACHIKOMA_SSE_URL=http://your-server:8000/api/mcp/sse
TACHIKOMA_TOKEN=your-jwt-token
```

## Manual Install

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "tachikoma": {
      "command": "npx",
      "args": ["-y", "tachikoma-mcp-server"]
    }
  }
}
```

## Architecture

```
Copilot Chat / Claude  <--stdio-->  tachikoma-mcp-server  <--SSE-->  tachikoma server
                                           |
                                  reads ~/.tachikoma/mcp-session.json
                                  (written by tachikoma-collab extension)
```

## Requirements

- A running tachikoma server with indexed repositories
- Node.js 18+
