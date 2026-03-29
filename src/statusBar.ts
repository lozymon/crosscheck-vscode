import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { buildArgs, getOutputChannel, resolveCx } from './cx';

// ─── Watch Mode ──────────────────────────────────────────────────────────────

let watchItem: vscode.StatusBarItem | undefined;
let watchProcess: child_process.ChildProcess | undefined;

export function createWatchStatusBar(context: vscode.ExtensionContext): void {
  watchItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    99,
  );
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
      'crosscheck: Open a .cx.yaml file to start watch mode.',
    );
    return;
  }

  const filePath = editor.document.uri.fsPath;
  const cx = resolveCx();
  const args = buildArgs(filePath, ['--watch']);
  const channel = getOutputChannel();
  channel.show(true);
  channel.appendLine(`\n> cx ${args.join(' ')}  [watch mode]\n`);

  const cwd =
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
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
