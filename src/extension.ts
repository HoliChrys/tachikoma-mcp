import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';

const SESSION_FILE = path.join(os.homedir(), '.tachikoma', 'mcp-session.json');

// Fallback "stale" window when the token has no decodable expires_at.
// Collab rewrites the session file every 10 min on token refresh, so 30 min
// means "we've missed at least two refresh cycles — something is wrong."
const STALE_AFTER_MS = 30 * 60 * 1000;

// Buffer below the token's real expiry. If the token expires in less than
// this we mark stale so the user reconnects before tools start failing.
const TOKEN_STALE_BUFFER_MS = 5 * 60 * 1000;

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
        vscode.commands.registerCommand('tachikoma-mcp.enableMcp', enableMcpSupport),
    );

    // VS Code ignores contributes.mcpServers unless chat.mcp.enabled is true.
    // Without this check, users install the extension, see nothing happen,
    // and there's no actionable error in the UI. Surface it once on first
    // activation per major version.
    await ensureMcpEnabled(context);

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

/** Decode tachikoma's base64-JSON token and return its expires_at (Unix
 * seconds), or null if undecodable. Tachikoma tokens aren't standard JWTs
 * — they're a single base64-encoded JSON blob. */
function tokenExpiresAt(token: string): number | null {
    try {
        // Handle both single-blob and dotted (JWT-shaped) tokens.
        const payload = token.includes('.') ? token.split('.')[1] : token;
        const pad = '='.repeat((4 - (payload.length % 4)) % 4);
        const b64 = (payload + pad).replace(/-/g, '+').replace(/_/g, '/');
        const decoded = Buffer.from(b64, 'base64').toString('utf-8');
        const obj = JSON.parse(decoded);
        const exp = typeof obj.expires_at === 'number' ? obj.expires_at : null;
        return exp;
    } catch {
        return null;
    }
}

function statusOf(session: McpSession | null): Status {
    if (!session?.token) return 'offline';

    // Primary signal: the token's own expires_at. If it's still good for
    // more than TOKEN_STALE_BUFFER_MS, we're connected regardless of
    // when the file was last touched.
    const exp = tokenExpiresAt(session.token);
    if (exp !== null) {
        const nowSec = Date.now() / 1000;
        if (exp - nowSec < TOKEN_STALE_BUFFER_MS / 1000) return 'stale';
        return 'connected';
    }

    // Fallback: file mtime — only if we can't decode the token at all.
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

async function ensureMcpEnabled(context: vscode.ExtensionContext): Promise<void> {
    const chatConfig = vscode.workspace.getConfiguration('chat');
    const enabled = chatConfig.get<boolean>('mcp.enabled');
    if (enabled === true) {
        output?.appendLine('chat.mcp.enabled = true — MCP servers will be picked up');
        return;
    }

    // Don't nag — only ask once per extension version.
    const flagKey = `mcpEnablePromptedFor:${context.extension.packageJSON.version}`;
    if (context.globalState.get<boolean>(flagKey)) {
        return;
    }
    await context.globalState.update(flagKey, true);

    const choice = await vscode.window.showInformationMessage(
        'Tachikoma MCP needs `chat.mcp.enabled` to be true so VS Code picks up '
        + 'the MCP server declared by this extension. Enable it now?',
        'Enable',
        'Open Setting',
        'Later',
    );
    if (choice === 'Enable') {
        await enableMcpSupport();
    } else if (choice === 'Open Setting') {
        await vscode.commands.executeCommand(
            'workbench.action.openSettings', 'chat.mcp.enabled',
        );
    }
}

async function enableMcpSupport(): Promise<void> {
    try {
        await vscode.workspace.getConfiguration('chat').update(
            'mcp.enabled', true, vscode.ConfigurationTarget.Global,
        );
        output?.appendLine('chat.mcp.enabled set to true (user settings)');
        const choice = await vscode.window.showInformationMessage(
            'MCP support enabled. Reload the window so VS Code re-scans MCP servers.',
            'Reload Window',
        );
        if (choice === 'Reload Window') {
            await vscode.commands.executeCommand('workbench.action.reloadWindow');
        }
    } catch (err) {
        output?.appendLine(`failed to set chat.mcp.enabled: ${err}`);
        vscode.window.showErrorMessage(
            `Could not enable MCP support automatically: ${err}. `
            + 'Open Settings (Cmd+,) and turn on "chat.mcp.enabled".',
        );
    }
}

export function deactivate() {
    statusBar?.dispose();
    output?.dispose();
}
