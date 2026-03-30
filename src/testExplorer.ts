import * as child_process from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildArgs, spawnCx, getActiveEnvFile } from './cx';
import { parseFile } from './parser';
import { applyDecorations } from './decorations';
import { showResultsPanel, JsonSuiteResult, RunMeta } from './resultsPanel';

export async function runViaController(
  ctrl: vscode.TestController,
  filePath: string,
  testName?: string,
): Promise<void> {
  const suiteItem = ctrl.items.get(filePath);
  if (!suiteItem) return;

  let include: vscode.TestItem[] | undefined;
  if (testName) {
    const child = findTestItem(suiteItem, testName);
    if (child) include = [child];
  } else {
    include = [suiteItem];
  }

  const tokenSource = new vscode.CancellationTokenSource();
  const request = new vscode.TestRunRequest(include);
  await runTests(ctrl, request, tokenSource.token);
}

export function createTestController(
  context: vscode.ExtensionContext,
): vscode.TestController {
  const ctrl = vscode.tests.createTestController('crosscheck', 'crosscheck');
  context.subscriptions.push(ctrl);

  // Build the initial test tree from all *.cx.yaml files in the workspace
  refreshTestTree(ctrl);

  // Watch for file changes to keep the tree in sync
  const watcher = vscode.workspace.createFileSystemWatcher('**/*.cx.yaml');
  watcher.onDidCreate(() => refreshTestTree(ctrl));
  watcher.onDidChange(() => refreshTestTree(ctrl));
  watcher.onDidDelete(() => refreshTestTree(ctrl));
  context.subscriptions.push(watcher);

  // Run handler — called when user clicks Run in the Test Explorer
  ctrl.createRunProfile(
    'Run',
    vscode.TestRunProfileKind.Run,
    (request, token) => runTests(ctrl, request, token),
    true,
  );

  return ctrl;
}

function refreshTestTree(ctrl: vscode.TestController): void {
  vscode.workspace
    .findFiles('**/*.cx.yaml', '**/node_modules/**')
    .then((uris) => {
      // Remove items for files that no longer exist
      ctrl.items.forEach((item) => {
        if (!uris.some((u) => u.fsPath === item.id)) {
          ctrl.items.delete(item.id);
        }
      });

      for (const uri of uris) {
        addFileToTree(ctrl, uri);
      }
    });
}

function addFileToTree(ctrl: vscode.TestController, uri: vscode.Uri): void {
  const { tests } = parseFile(uri.fsPath);
  const label = path.relative(
    vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '',
    uri.fsPath,
  );

  const suite = ctrl.createTestItem(uri.fsPath, label, uri);
  suite.children.replace(
    tests.map((t) => {
      const pos = new vscode.Position(t.line, 0);
      const item = ctrl.createTestItem(`${uri.fsPath}::${t.name}`, t.name, uri);
      item.range = new vscode.Range(pos, pos);
      return item;
    }),
  );
  ctrl.items.add(suite);
}

async function runTests(
  ctrl: vscode.TestController,
  request: vscode.TestRunRequest,
  token: vscode.CancellationToken,
): Promise<void> {
  const run = ctrl.createTestRun(request);
  const runAt = new Date();
  const runResults: JsonSuiteResult[] = [];

  // Collect which suite files to run
  const suitesToRun = new Map<string, vscode.TestItem[]>(); // filePath → test items

  if (request.include) {
    for (const item of request.include) {
      const filePath = item.parent ? item.parent.id : item.id;
      if (!suitesToRun.has(filePath)) suitesToRun.set(filePath, []);
      suitesToRun.get(filePath)!.push(item);
    }
  } else {
    // Run all
    ctrl.items.forEach((suite) => {
      suitesToRun.set(suite.id, [suite]);
    });
  }

  for (const [filePath, items] of suitesToRun) {
    if (token.isCancellationRequested) break;

    // Mark all tests in this file as running
    const suite = ctrl.items.get(filePath);
    if (!suite) continue;
    suite.children.forEach((child) => run.started(child));
    if (items.length === 1 && items[0].id === filePath) run.started(suite);

    // Snapshot children NOW so refresh watcher can't replace items mid-run
    const childMap = new Map<string, vscode.TestItem>();
    suite.children.forEach((child) => childMap.set(child.label, child));

    const tmpFile = path.join(
      os.tmpdir(),
      `cx-results-${Date.now()}-${Math.random().toString(36).slice(2)}.json`,
    );

    try {
      const { exitCode, stderr } = await runFile(filePath, tmpFile, token);
      const suiteResult = applyResults(
        suite,
        childMap,
        run,
        filePath,
        tmpFile,
        exitCode,
        stderr,
      );
      if (suiteResult) runResults.push(suiteResult);
    } catch (err) {
      // Connection error or binary not found
      childMap.forEach((child) =>
        run.errored(child, new vscode.TestMessage(String(err))),
      );
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        /* ignore */
      }
    }
  }

  run.end();

  const allResults = runResults;
  if (allResults.length > 0) {
    let gitUser: string | undefined;
    try {
      const wsFolder = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
      gitUser =
        child_process
          .execSync('git config user.name', {
            cwd: wsFolder,
            encoding: 'utf8',
            stdio: ['pipe', 'pipe', 'pipe'],
          })
          .trim() || undefined;
    } catch {
      /* not a git repo or no user set */
    }

    const meta: RunMeta = { runAt, envFile: getActiveEnvFile(), gitUser };
    showResultsPanel(allResults, meta);
  }
}

function runFile(
  filePath: string,
  outputFile: string,
  token: vscode.CancellationToken,
): Promise<{ exitCode: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const args = buildArgs(filePath, [
      '--reporter',
      'json',
      '--output-file',
      outputFile,
    ]);
    const proc = spawnCx(args);

    const stderrChunks: Buffer[] = [];
    proc.stderr?.on('data', (chunk: Buffer) => stderrChunks.push(chunk));

    token.onCancellationRequested(() => proc.kill());

    proc.on('close', (code) =>
      resolve({
        exitCode: code ?? 1,
        stderr: Buffer.concat(stderrChunks).toString().trim(),
      }),
    );
    proc.on('error', reject);
  });
}

function applyResults(
  suite: vscode.TestItem,
  childMap: Map<string, vscode.TestItem>,
  run: vscode.TestRun,
  filePath: string,
  outputFile: string,
  exitCode: number,
  stderr: string = '',
): JsonSuiteResult | undefined {
  // Exit code 2 = YAML/config error, 3 = connection error — suite-level failure
  if (exitCode === 2 || exitCode === 3) {
    const label = exitCode === 2 ? 'Validation error' : 'Connection error';
    // Try to read setup_error from JSON output — it often contains the real cause
    let detail = stderr ? `\n\n${stderr}` : '';
    try {
      const parsed = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      if (parsed.setup_error) {
        detail = `\n\n${parsed.setup_error.trim()}`;
      }
    } catch {
      /* JSON may not exist; fall back to stderr */
    }
    run.errored(suite, new vscode.TestMessage(`${label}${detail}`));
    suite.children.forEach((child) =>
      run.errored(child, new vscode.TestMessage(`${label}${detail}`)),
    );
    return {
      suite: suite.label,
      passed: 0,
      failed: 0,
      setup_error: `${label}${detail}`,
      tests: [],
    };
  }

  let result: JsonSuiteResult;
  try {
    result = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  } catch {
    run.errored(
      suite,
      new vscode.TestMessage('Could not read cx JSON output.'),
    );
    return undefined;
  }

  if (result.setup_error) {
    run.errored(
      suite,
      new vscode.TestMessage(`Setup error: ${result.setup_error}`),
    );
  }

  const failures: Array<{ line: number; message: string }> = [];

  for (const t of result.tests ?? []) {
    const item = childMap.get(t.name);
    if (!item) continue;

    if (t.passed) {
      const msg =
        t.attempts > 1
          ? new vscode.TestMessage(`Passed on attempt ${t.attempts}`)
          : undefined;
      run.passed(item, undefined);
      if (msg) run.appendOutput(`  ${t.name}: ${msg.message}\r\n`);
    } else if (t.error) {
      run.errored(item, new vscode.TestMessage(t.error));
    } else {
      const messages = t.failures.map((f) => {
        const msg = new vscode.TestMessage(`[${f.step}] ${f.message}`);
        if (item.range) {
          msg.location = new vscode.Location(
            vscode.Uri.file(filePath),
            item.range,
          );
          failures.push({ line: item.range.start.line, message: f.message });
        }
        return msg;
      });
      run.failed(
        item,
        messages.length ? messages : [new vscode.TestMessage('Test failed')],
      );
    }
  }

  // Drive inline decorations from test results
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.fsPath === filePath,
  );
  if (editor) {
    applyDecorations(editor, failures);
  }

  return result;
}

function findTestItem(
  suite: vscode.TestItem,
  name: string,
): vscode.TestItem | undefined {
  let found: vscode.TestItem | undefined;
  suite.children.forEach((child) => {
    if (child.label === name) found = child;
  });
  return found;
}
