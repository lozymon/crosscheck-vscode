import * as path from 'path';
import * as vscode from 'vscode';

export interface JsonTestFailure {
  step: string;
  message: string;
}

export interface JsonTestResult {
  name: string;
  passed: boolean;
  attempts: number;
  failures: JsonTestFailure[];
  error: string | null;
}

export interface JsonSuiteResult {
  suite: string;
  passed: number;
  failed: number;
  setup_error?: string;
  teardown_error?: string;
  tests: JsonTestResult[];
}

export interface RunMeta {
  runAt: Date;
  envFile: string;
  gitUser: string | undefined;
}

let panel: vscode.WebviewPanel | undefined;
let extensionUri: vscode.Uri | undefined;

export function initResultsPanel(uri: vscode.Uri): void {
  extensionUri = uri;
}

export function showResultsPanel(
  suites: JsonSuiteResult[],
  meta: RunMeta,
): void {
  if (panel) {
    panel.reveal(vscode.ViewColumn.Beside, false);
  } else {
    panel = vscode.window.createWebviewPanel(
      'crosscheckResults',
      'crosscheck: results',
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: false },
    );
    if (extensionUri) {
      panel.iconPath = vscode.Uri.joinPath(extensionUri, 'icon.png');
    }
    panel.onDidDispose(() => {
      panel = undefined;
    });
  }

  panel.title = 'crosscheck: results';
  panel.webview.html = buildHtml(suites, meta);
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildMetaHtml(meta: RunMeta): string {
  const ts = meta.runAt.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const env = esc(path.basename(meta.envFile));
  const user = meta.gitUser ? esc(meta.gitUser) : undefined;
  return `
    <div class="meta">
      <span class="meta-item"><span class="meta-icon">🕐</span>${ts}</span>
      <span class="meta-item"><span class="meta-icon">⚙</span>${env}</span>
      ${user ? `<span class="meta-item"><span class="meta-icon">👤</span>${user}</span>` : ''}
    </div>`;
}

function buildSuiteHtml(suite: JsonSuiteResult): string {
  const name = path.basename(suite.suite);
  const tests = suite.tests ?? [];
  const total = tests.length;

  let rows = '';
  for (const t of tests) {
    let badgeClass: string;
    let badgeText: string;
    let details = '';

    if (t.passed) {
      badgeClass = 'pass';
      badgeText = '✓ pass';
      if (t.attempts > 1) details = `retry ×${t.attempts}`;
    } else if (t.error) {
      badgeClass = 'error';
      badgeText = '✗ error';
      details = t.error.replace(/\r?\n/g, ' ');
    } else {
      badgeClass = 'fail';
      badgeText = '✗ fail';
      const f = t.failures[0];
      if (f)
        details = `[${esc(f.step)}] ${esc(f.message)}`.replace(/\r?\n/g, ' ');
    }

    rows += `
      <tr class="${badgeClass}">
        <td class="name">${esc(t.name)}</td>
        <td class="status"><span class="badge ${badgeClass}">${badgeText}</span></td>
        <td class="details">${details}</td>
      </tr>`;
  }

  const setupErr = suite.setup_error
    ? `<div class="alert">Setup error: ${esc(suite.setup_error)}</div>`
    : '';
  const teardownErr = suite.teardown_error
    ? `<div class="alert">Teardown error: ${esc(suite.teardown_error)}</div>`
    : '';

  return `
    <section class="suite">
      <h2>${esc(name)}</h2>
      ${setupErr}${teardownErr}
      <table>
        <thead>
          <tr>
            <th>Test</th>
            <th>Status</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="summary">
        <span>${total} test${total !== 1 ? 's' : ''}</span>
        <span class="pass-count">${suite.passed} passed</span>
        ${suite.failed > 0 ? `<span class="fail-count">${suite.failed} failed</span>` : ''}
      </div>
    </section>`;
}

function buildHtml(suites: JsonSuiteResult[], meta: RunMeta): string {
  const body = suites
    .map((s) => {
      try {
        return buildSuiteHtml(s);
      } catch {
        return `<section class="suite"><div class="alert">Failed to render suite: ${esc(String(s?.suite ?? '?'))}</div></section>`;
      }
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  *, *::before, *::after { box-sizing: border-box; }

  body {
    font-family: var(--vscode-font-family, sans-serif);
    font-size: var(--vscode-font-size, 13px);
    color: var(--vscode-foreground);
    background: var(--vscode-editor-background);
    padding: 1.5rem 2rem;
    margin: 0;
  }

  .suite {
    margin-bottom: 2.5rem;
  }

  h2 {
    font-size: 1em;
    font-weight: 600;
    color: var(--vscode-textLink-foreground);
    margin: 0 0 0.75rem;
    letter-spacing: 0.02em;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    border: 1px solid var(--vscode-panel-border, #333);
    border-radius: 4px;
    overflow: hidden;
  }

  thead tr {
    background: var(--vscode-list-hoverBackground);
  }

  th {
    text-align: left;
    padding: 0.45rem 0.75rem;
    font-weight: 600;
    font-size: 0.9em;
    color: var(--vscode-foreground);
    opacity: 0.7;
    border-bottom: 1px solid var(--vscode-panel-border, #333);
  }

  td {
    padding: 0.4rem 0.75rem;
    border-bottom: 1px solid var(--vscode-panel-border, #2a2a2a);
    vertical-align: top;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  tbody tr:hover {
    background: var(--vscode-list-hoverBackground);
  }

  td.name {
    width: 30%;
    font-family: var(--vscode-editor-font-family, monospace);
  }

  td.status {
    width: 9em;
    white-space: nowrap;
  }

  td.details {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
    color: var(--vscode-descriptionForeground);
    word-break: break-word;
  }

  .badge {
    display: inline-block;
    padding: 0.15em 0.55em;
    border-radius: 3px;
    font-size: 0.85em;
    font-weight: 600;
    font-family: var(--vscode-editor-font-family, monospace);
  }

  .badge.pass {
    background: var(--vscode-testing-iconPassed, #388a34);
    color: #fff;
  }

  .badge.fail {
    background: var(--vscode-testing-iconFailed, #c72e0f);
    color: #fff;
  }

  .badge.error {
    background: var(--vscode-testing-iconErrored, #f14c4c);
    color: #fff;
  }

  .alert {
    padding: 0.4rem 0.75rem;
    background: var(--vscode-inputValidation-errorBackground);
    border: 1px solid var(--vscode-inputValidation-errorBorder);
    border-radius: 3px;
    margin-bottom: 0.5rem;
    font-size: 0.9em;
  }

  .summary {
    margin-top: 0.5rem;
    font-size: 0.88em;
    color: var(--vscode-descriptionForeground);
    display: flex;
    gap: 1rem;
  }

  .pass-count { color: var(--vscode-testing-iconPassed, #388a34); }
  .fail-count { color: var(--vscode-testing-iconFailed, #c72e0f); font-weight: 600; }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 1.25rem;
    margin-bottom: 1.5rem;
    padding: 0.5rem 0.75rem;
    background: var(--vscode-list-hoverBackground);
    border-radius: 4px;
    font-size: 0.88em;
    color: var(--vscode-descriptionForeground);
    border: 1px solid var(--vscode-panel-border, #333);
  }

  .meta-item {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .meta-icon {
    opacity: 0.7;
    font-style: normal;
  }
</style>
</head>
<body>
${buildMetaHtml(meta)}
${body}
</body>
</html>`;
}
