# Tachikoma MCP Server

Code intelligence for your AI assistant — semantic search, impact analysis,
rename refactoring, wiki generation. Powered by the
[tachikoma](https://github.com/HoliChrys/tachikoma) knowledge graph.

[![Install in VS Code](https://img.shields.io/badge/VS_Code-0098FF?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode:mcp/install?%7B%22name%22%3A%22tachikoma%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22tachikoma-mcp-server%22%5D%7D) [![Install in VS Code Insiders](https://img.shields.io/badge/VS_Code_Insiders-24bfa5?style=flat-square&logo=visualstudiocode&logoColor=white)](https://vscode.dev/redirect?url=vscode-insiders:mcp/install?%7B%22name%22%3A%22tachikoma%22%2C%22type%22%3A%22stdio%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22tachikoma-mcp-server%22%5D%7D)

## What it does

This extension registers `tachikoma` as an MCP server via
[`contributes.mcpServers`](https://code.visualstudio.com/api/extension-guides/mcp).
Copilot Chat (and any other MCP client that reads the VS Code registry)
picks up 27 tools at launch — without you editing `mcp.json` by hand.

The MCP transport is a tiny stdio↔SSE bridge (`tachikoma-mcp-server` on
npm) spawned by VS Code. It reads your auth from the session file written
by the [Tachikoma Collab](https://marketplace.visualstudio.com/items?itemName=Tachikoma.tachikoma-collab)
extension, so there are no tokens in your VS Code settings.

## Quick start

1. Click an install badge above (or search **Tachikoma MCP Server** in the
   VS Code Extensions panel).
2. Install **Tachikoma Collab** as well — it's a hard dependency.
3. `Cmd+Shift+P` → *Tachikoma: Connect to Computer*.
4. Status bar shows `⚡ Tachikoma MCP` when ready. The MCP panel lists 27
   tools.

## Status bar & commands

The right-side status bar item reflects session health:

| Icon | State | Meaning |
|------|-------|---------|
| `⚡ Tachikoma MCP` | connected | Session refreshed within the last 5 min |
| `⚠ Tachikoma MCP` (yellow) | stale | Session older than 5 min — click to reconnect |
| `🚫 Tachikoma MCP` (red) | offline | No session — Collab not connected |

Click → menu: **Reconnect**, **Show Logs**, **Status**.

Commands (all callable from the palette):

- `Tachikoma MCP: Reconnect` — refresh the session token from Collab
- `Tachikoma MCP: Show Logs` — open the OutputChannel
- `Tachikoma MCP: Show Menu` — same as clicking the status bar

## Tools

### Code intelligence (`indexing.*`)

| Tool | Description |
|------|-------------|
| `indexing.list_repos` | List indexed contexts |
| `indexing.query` | Search the knowledge graph |
| `indexing.context` | 360° view of a symbol |
| `indexing.impact` | Blast-radius — what breaks if you change a symbol |
| `indexing.detect_changes` | Map git diff to indexed symbols |
| `indexing.rename` | Multi-file rename, call-graph aware |
| `indexing.wiki` | Generate Markdown + Mermaid docs |
| `indexing.processes` | Traced execution flows |
| `indexing.communities` | Functional areas (graph clustering) |
| `indexing.route_map` | HTTP routes + handlers + consumers |
| `indexing.shape_check` | Provider response vs consumer accesses |
| `indexing.api_impact` | Impact scoped to one HTTP route |
| `indexing.cypher` | Read-only Cypher (admin) |
| `indexing.tool_map` | MCP/RPC tool definitions in the codebase |
| `indexing.group_list` | Indexed context groups |
| `indexing.group_sync` | Match providers/consumers across contexts |

### Workflow (`workflow.*`)

`query_knowledge`, `transition_state`, `create_plan`, `create_task`,
`create_artifact`, `complete_work_item`, `run_query`,
`run_parallel_queries`, `queue_parallel_task`, `execute_queued_tasks`,
`get_ray_status` — Ray-backed agent-loop primitives.

## Active context = no `context_path` needed

When you open a workspace folder mapped to a tachikoma context, Collab adds
it to `activeContexts`. The bridge pushes that list to the server. For any
`indexing.*` call that omits `context_path`, the server fills it from the
first active context — your agent doesn't need to know context paths.

## Manual install (without the extension)

If you don't want this extension, add to `.vscode/mcp.json` directly:

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

You'll still need Tachikoma Collab for auth — or set
`TACHIKOMA_TOKEN` + `TACHIKOMA_SSE_URL` in the env.

## Architecture

```
  Copilot Chat / any MCP client
            │ stdio JSON-RPC
            ▼
  tachikoma-mcp-server (npx, auto-spawned)
            │ SSE + POST (Bearer)
            ▼
  tachikoma server (FastAPI, /api/mcp)
            ▲
            │ reads ~/.tachikoma/mcp-session.json
            │
  Tachikoma Collab (this extension's hard dep)
```

## Troubleshooting

| Symptom | What to check |
|---------|---------------|
| Status bar says **offline** | Connect via Tachikoma Collab first. |
| Status bar says **stale** | Click → Reconnect. Or wait — Collab refreshes the session on every workspace change. |
| MCP panel shows 0 tools | Your token lacks ACL grants on the indexing channels. Log in as an admin or grant access. |
| Tools error: `missing context_path` | Open a workspace mapped to a tachikoma context, or pass `context_path` explicitly. |
| Bridge can't reach server | `Show Logs` to see retries. Check the server's `process.xml reach=` attribute and `mise process:status tachikoma-api`. |

## Requirements

- VS Code 1.99+ (for `contributes.mcpServers`)
- Node 18+ (for the npm bridge that VS Code auto-runs)
- A running tachikoma server with indexed contexts
- The **Tachikoma Collab** extension installed and connected

## License

MIT
