import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { resolveCx } from './cx';

let panel: vscode.WebviewPanel | undefined;
let currentFile: string | undefined;

export function showExplainPanel(filePath: string): void {
  currentFile = filePath;

  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside);
  } else {
    panel = vscode.window.createWebviewPanel(
      'crosscheckExplain',
      'crosscheck: explain',
      vscode.ViewColumn.Beside,
      { enableScripts: false }
    );
    panel.onDidDispose(() => {
      panel = undefined;
      currentFile = undefined;
    });
  }

  renderExplain(filePath);
}

export function refreshExplainPanel(filePath: string): void {
  if (panel && currentFile === filePath) {
    renderExplain(filePath);
  }
}

function renderExplain(filePath: string): void {
  if (!panel) return;
  panel.title = `explain: ${filePath.split('/').pop()}`;
  panel.webview.html = loadingHtml();

  const cx = resolveCx();
  child_process.exec(`"${cx}" explain "${filePath}"`, (err, stdout, stderr) => {
    if (!panel) return;
    const output = stdout || stderr || (err?.message ?? 'No output.');
    panel.webview.html = renderHtml(output);
  });
}

function loadingHtml(): string {
  return wrapHtml('<p class="loading">Running cx explain…</p>');
}

function renderHtml(output: string): string {
  const escaped = output
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return wrapHtml(`<pre>${escaped}</pre>`);
}

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  body {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: var(--vscode-editor-font-size, 13px);
    color: var(--vscode-editor-foreground);
    background: var(--vscode-editor-background);
    padding: 1.5em 2em;
    margin: 0;
  }
  pre {
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    line-height: 1.6;
  }
  .loading { opacity: 0.6; font-style: italic; }
</style>
</head>
<body>${body}</body>
</html>`;
}
