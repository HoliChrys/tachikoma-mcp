import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const SESSION_FILE = path.join(os.homedir(), '.tachikoma', 'mcp-session.json');

// Session is considered "stale" if not refreshed in this window.
const STALE_AFTER_MS = 5 * 60 * 1000;

type Status = 'connected' | 'stale' | 'offline';

let statusBar: vscode.StatusBarItem | undefined;
let output: vscode.OutputChannel | undefined;

interface McpSession {
    host: string;
    token: string;
    userId: string;
    sseUrl: string;
    activeContexts: string[];
    updatedAt: string;
}

export async function activate(context: vscode.ExtensionContext) {
    output = vscode.window.createOutputChannel('Tachikoma MCP');
    context.subscriptions.push(output);

    statusBar = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Right, 100,
    );
    statusBar.command = 'tachikoma-mcp.menu';
    statusBar.show();
    context.subscriptions.push(statusBar);
    refreshStatus();

    context.subscriptions.push(
        vscode.commands.registerCommand('tachikoma-mcp.menu', showMenu),
        vscode.commands.registerCommand('tachikoma-mcp.reconnect', reconnect),
        vscode.commands.registerCommand('tachikoma-mcp.showLogs', () => output?.show()),
    );

    await ensureSession();

    // Watch the directory rather than the file — collab writes via atomic rename.
    try {
        const dir = path.dirname(SESSION_FILE);
        fs.mkdirSync(dir, { recursive: true });
        const watcher = fs.watch(dir, (_, filename) => {
            if (filename === path.basename(SESSION_FILE)) refreshStatus();
        });
        context.subscriptions.push({ dispose: () => watcher.close() });
    } catch (err) {
        output?.appendLine(`watch failed: ${err}`);
    }

    // Periodic refresh — token rotation, drift, etc.
    const interval = setInterval(refreshStatus, 30_000);
    context.subscriptions.push({ dispose: () => clearInterval(interval) });
}

function readSession(): McpSession | null {
    try {
        return JSON.parse(fs.readFileSync(SESSION_FILE, 'utf-8'));
    } catch {
        return null;
    }
}

// Collab >=4.4.0 returns the full McpSession shape. Older versions return
// {host, token, userId} only — we fill in the rest as a fallback.
function writeSession(partial: Partial<McpSession> & { host: string; token: string }): void {
    const dir = path.dirname(SESSION_FILE);
    fs.mkdirSync(dir, { recursive: true });
    const session: McpSession = {
        host: partial.host,
        token: partial.token,
        userId: partial.userId ?? '',
        sseUrl: partial.sseUrl ?? `${partial.host}/api/mcp/sse`,
        activeContexts: partial.activeContexts ?? [],
        updatedAt: new Date().toISOString(),
    };
    const tmp = `${SESSION_FILE}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(session, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, SESSION_FILE);
}

function statusOf(session: McpSession | null): Status {
    if (!session?.token) return 'offline';
    const updated = Date.parse(session.updatedAt);
    if (Number.isNaN(updated)) return 'stale';
    if (Date.now() - updated > STALE_AFTER_MS) return 'stale';
    return 'connected';
}

function refreshStatus(): void {
    if (!statusBar) return;
    const session = readSession();
    const status = statusOf(session);
    switch (status) {
        case 'connected':
            statusBar.text = '$(zap) Tachikoma MCP';
            statusBar.tooltip = `Connected as ${session!.userId} → ${session!.sseUrl}\nClick for menu`;
            statusBar.backgroundColor = undefined;
            break;
        case 'stale':
            statusBar.text = '$(warning) Tachikoma MCP';
            statusBar.tooltip = `Session stale (last refresh: ${session?.updatedAt ?? 'n/a'})\nClick to reconnect`;
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
            break;
        case 'offline':
            statusBar.text = '$(circle-slash) Tachikoma MCP';
            statusBar.tooltip = 'Not connected — click to connect via Tachikoma Collab';
            statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.errorBackground');
            break;
    }
}

async function showMenu(): Promise<void> {
    const session = readSession();
    const status = statusOf(session);
    const items: (vscode.QuickPickItem & { id: string })[] = [
        { id: 'reconnect', label: '$(refresh) Reconnect',
          description: 'Refresh session token from Tachikoma Collab' },
        { id: 'logs', label: '$(output) Show Logs',
          description: 'Open the Tachikoma MCP output channel' },
        { id: 'status', label: `$(info) Status: ${status}`,
          description: session ? `${session.userId} → ${session.sseUrl}` : 'No session' },
    ];
    const pick = await vscode.window.showQuickPick(items, {
        placeHolder: 'Tachikoma MCP',
    });
    if (!pick) return;
    switch (pick.id) {
        case 'reconnect': await reconnect(); break;
        case 'logs': output?.show(); break;
        case 'status':
            vscode.window.showInformationMessage(
                `Tachikoma MCP: ${status}` +
                (session ? ` (${session.userId})` : ''),
            );
            break;
    }
}

async function reconnect(): Promise<void> {
    output?.appendLine('reconnect: requesting session from tachikoma-collab');
    try {
        const session = await vscode.commands.executeCommand('tachikoma.getMcpSession');
        if (session && typeof session === 'object' && 'token' in (session as any)) {
            writeSession(session as McpSession);
            output?.appendLine('reconnect: session refreshed');
            refreshStatus();
            vscode.window.showInformationMessage('Tachikoma MCP: session refreshed.');
            return;
        }
        output?.appendLine('reconnect: collab returned no session');
        const choice = await vscode.window.showWarningMessage(
            'Tachikoma MCP: no session available. Connect via Tachikoma Collab first.',
            'Open Collab', 'Show Logs',
        );
        if (choice === 'Open Collab') {
            await vscode.commands.executeCommand('tachikoma.connect');
        } else if (choice === 'Show Logs') {
            output?.show();
        }
    } catch (err) {
        output?.appendLine(`reconnect failed: ${err}`);
        vscode.window.showErrorMessage(`Tachikoma MCP reconnect failed: ${err}`);
    }
}

async function ensureSession(): Promise<void> {
    if (statusOf(readSession()) === 'connected') return;
    try {
        const session = await vscode.commands.executeCommand('tachikoma.getMcpSession');
        if (session && typeof session === 'object' && 'token' in (session as any)) {
            writeSession(session as McpSession);
            refreshStatus();
            return;
        }
    } catch {
        // tachikoma-collab not connected yet — fall through to prompt.
    }
    vscode.window.showWarningMessage(
        'Tachikoma MCP: not connected. Connect via Tachikoma Collab first.',
        'Connect',
    ).then(choice => {
        if (choice === 'Connect') {
            vscode.commands.executeCommand('tachikoma.connect');
        }
    });
}

export function deactivate() {
    statusBar?.dispose();
    output?.dispose();
}
