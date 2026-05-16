import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    // The MCP server is declared in contributes.mcpServers
    // VS Code handles the lifecycle automatically via npx tachikoma-mcp-server
}

export function deactivate() {}
