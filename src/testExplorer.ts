import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { buildArgs, spawnCx } from './cx';
import { parseFile } from './parser';
import { applyDecorations, clearDecorations } from './decorations';

// Shape of a single test in the JSON reporter output
interface JsonTestResult {
  name: string;
  passed: boolean;
  attempts: number;
  failures: Array<{ step: string; message: string }>;
  error: string | null;
}

// Shape of the JSON reporter output file
interface JsonSuiteResult {
  suite: string;
  passed: number;
  failed: number;
  setup_error?: string;
  teardown_error?: string;
  tests: JsonTestResult[];
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

    const tmpFile = path.join(os.tmpdir(), `cx-results-${Date.now()}.json`);

    try {
      const exitCode = await runFile(filePath, tmpFile, token);
      applyResults(ctrl, run, filePath, tmpFile, exitCode);
    } catch (err) {
      // Connection error or binary not found
      suite.children.forEach((child) =>
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
}

function runFile(
  filePath: string,
  outputFile: string,
  token: vscode.CancellationToken,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const args = buildArgs(filePath, [
      '--reporter',
      'json',
      '--output-file',
      outputFile,
    ]);
    const proc = spawnCx(args);

    token.onCancellationRequested(() => proc.kill());

    proc.on('close', (code) => resolve(code ?? 1));
    proc.on('error', reject);
  });
}

function applyResults(
  ctrl: vscode.TestController,
  run: vscode.TestRun,
  filePath: string,
  outputFile: string,
  exitCode: number,
): void {
  const suite = ctrl.items.get(filePath);
  if (!suite) return;

  // Exit code 2 = YAML/config error, 3 = connection error — suite-level failure
  if (exitCode === 2 || exitCode === 3) {
    const label = exitCode === 2 ? 'Validation error' : 'Connection error';
    run.errored(
      suite,
      new vscode.TestMessage(`cx exited with code ${exitCode}: ${label}`),
    );
    suite.children.forEach((child) =>
      run.errored(child, new vscode.TestMessage(label)),
    );
    return;
  }

  let result: JsonSuiteResult;
  try {
    result = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
  } catch {
    run.errored(
      suite,
      new vscode.TestMessage('Could not read cx JSON output.'),
    );
    return;
  }

  if (result.setup_error) {
    run.errored(
      suite,
      new vscode.TestMessage(`Setup error: ${result.setup_error}`),
    );
  }

  const failures: Array<{ line: number; message: string }> = [];

  for (const t of result.tests) {
    const item = findTestItem(suite, t.name);
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
  const uri = vscode.Uri.file(filePath);
  const editor = vscode.window.visibleTextEditors.find(
    (e) => e.document.uri.fsPath === filePath,
  );
  if (editor) {
    applyDecorations(editor, failures);
  }
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
