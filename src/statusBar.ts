import * as child_process from 'child_process';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildArgs, getOutputChannel, resolveCx } from './cx';

const ENV_STATE_KEY = 'crosscheck.activeEnvFile';

// ─── Environment Switcher ────────────────────────────────────────────────────

let envItem: vscode.StatusBarItem | undefined;

export function createEnvStatusBar(context: vscode.ExtensionContext): void {
  envItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  envItem.command = 'crosscheck.switchEnv';
  envItem.tooltip = 'crosscheck: switch active .env file';
  context.subscriptions.push(envItem);
  updateEnvLabel(context);
  envItem.show();
}

function updateEnvLabel(context: vscode.ExtensionContext): void {
  const active = getActiveEnvFile(context);
  if (envItem) {
    envItem.text = `$(gear) ENV: ${path.basename(active)}`;
  }
}

export function getActiveEnvFile(context: vscode.ExtensionContext): string {
  const stored = context.workspaceState.get<string>(ENV_STATE_KEY);
  if (stored) return stored;
  const config = vscode.workspace.getConfiguration('crosscheck');
  return config.get<string>('defaultEnvFile', '.env');
}

export async function switchEnv(context: vscode.ExtensionContext): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (!workspaceRoot) {
    vscode.window.showErrorMessage('crosscheck: No workspace folder open.');
    return;
  }

  const envFiles = await vscode.workspace.findFiles(
    new vscode.RelativePattern(workspaceRoot, '.env*'),
    '**/node_modules/**'
  );

  if (envFiles.length === 0) {
    vscode.window.showInformationMessage('crosscheck: No .env* files found in workspace root.');
    return;
  }

  const items = envFiles.map(f => ({
    label: path.basename(f.fsPath),
    description: f.fsPath,
    fsPath: f.fsPath,
  }));

  const picked = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select active .env file for cx invocations',
  });

  if (!picked) return;

  await context.workspaceState.update(ENV_STATE_KEY, picked.fsPath);
  updateEnvLabel(context);
}

// ─── Watch Mode ──────────────────────────────────────────────────────────────

let watchItem: vscode.StatusBarItem | undefined;
let watchProcess: child_process.ChildProcess | undefined;

export function createWatchStatusBar(context: vscode.ExtensionContext): void {
  watchItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
  watchItem.command = 'crosscheck.toggleWatch';
  watchItem.tooltip = 'crosscheck: toggle watch mode';
  context.subscriptions.push(watchItem);
  setWatchLabel(false);
  watchItem.show();
}

function setWatchLabel(active: boolean): void {
  if (!watchItem) return;
  watchItem.text = active ? '$(eye) WATCH' : '$(eye-closed) WATCH';
  watchItem.color = active
    ? new vscode.ThemeColor('statusBarItem.warningForeground')
    : undefined;
}

export function toggleWatch(): void {
  if (watchProcess) {
    stopWatch();
  } else {
    startWatch();
  }
}

function startWatch(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor?.document.fileName.endsWith('.cx.yaml')) {
    vscode.window.showInformationMessage(
      'crosscheck: Open a .cx.yaml file to start watch mode.'
    );
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const cx = resolveCx();
  const args = buildArgs(filePath, ['--watch']);
  const channel = getOutputChannel();
  channel.show(true);
  channel.appendLine(`\n> cx ${args.join(' ')}  [watch mode]\n`);

  const cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  watchProcess = child_process.spawn(cx, args, { cwd });
  watchProcess.stdout?.on('data', (d: Buffer) => channel.append(d.toString()));
  watchProcess.stderr?.on('data', (d: Buffer) => channel.append(d.toString()));
  watchProcess.on('close', () => {
    watchProcess = undefined;
    setWatchLabel(false);
    channel.appendLine('\n[watch mode stopped]');
  });

  setWatchLabel(true);
}

function stopWatch(): void {
  watchProcess?.kill();
  watchProcess = undefined;
  setWatchLabel(false);
}

export function disposeWatch(): void {
  stopWatch();
}
