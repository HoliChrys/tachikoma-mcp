import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const SESSION_FILE = path.join(os.homedir(), '.tachikoma', 'mcp-session.json');

export async function activate(context: vscode.ExtensionContext) {
    // Check if tachikoma-collab is connected and session exists
    await ensureSession();

    // Watch for session changes (tachikoma-collab writes on connect/refresh)
    const watcher = fs.watch(path.dirname(SESSION_FILE), (_, filename) => {
        if (filename === 'mcp-session.json') {
            checkSession();
        }
    });
    context.subscriptions.push({ dispose: () => watcher.close() });

    // Periodic check (token refresh)
    const interval = setInterval(() => checkSession(), 60_000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

async function ensureSession(): Promise<void> {
    if (hasValidSession()) return;

    // Try to get session from tachikoma-collab
    try {
        const session = await vscode.commands.executeCommand('tachikoma.getMcpSession');
        if (session && typeof session === 'object' && 'token' in (session as any)) {
            writeSession(session as any);
            return;
        }
    } catch {
        // tachikoma-collab not connected yet
    }

    vscode.window.showWarningMessage(
        'Tachikoma MCP: Not connected. Connect via Tachikoma Collab extension first.',
        'Connect'
    ).then(choice => {
        if (choice === 'Connect') {
            vscode.commands.executeCommand('tachikoma.connect');
        }
    });
}

function hasValidSession(): boolean {
    try {
        const data = JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
        return !!(data.host && data.token);
    } catch {
        return false;
    }
}

function writeSession(session: { host: string; token: string; userId: string; sseUrl: string; activeContexts: string[] }): void {
    const dir = path.dirname(SESSION_FILE);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SESSION_FILE, JSON.stringify({
        ...session,
        updatedAt: new Date().toISOString(),
    }, null, 2), { mode: 0o600 });
}

function checkSession(): void {
    if (!hasValidSession()) {
        // Session gone or expired — try refresh from collab extension
        vscode.commands.executeCommand('tachikoma.getMcpSession').then((session: any) => {
            if (session?.token) {
                writeSession(session);
            }
        }, () => {});
    }
}

export function deactivate() {}
