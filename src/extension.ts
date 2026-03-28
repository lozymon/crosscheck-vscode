import * as path from 'path';
import * as vscode from 'vscode';
import { CrosscheckCodelensProvider } from './codelens';
import { buildArgs, checkVersion, resolveCx, spawnCx } from './cx';
import { clearDecorations } from './decorations';
import { CrosscheckDocumentSymbolProvider } from './symbols';
import { createTestController } from './testExplorer';
import {
  createEnvStatusBar,
  createWatchStatusBar,
  disposeWatch,
  switchEnv,
  toggleWatch,
} from './statusBar';

export function activate(context: vscode.ExtensionContext): void {
  checkVersion();

  // ── Phase 1 ────────────────────────────────────────────────────────────────

  const codelens = new CrosscheckCodelensProvider();

  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider({ pattern: '**/*.cx.yaml' }, codelens),

    vscode.commands.registerCommand(
      'crosscheck.runTest',
      (file: string, testName: string) => {
        spawnCx(buildArgs(file, ['--filter', testName]));
      }
    ),

    vscode.commands.registerCommand('crosscheck.runFile', (file: string) => {
      spawnCx(buildArgs(file, []));
    }),

    vscode.commands.registerCommand('crosscheck.runAll', () => {
      spawnCx(buildArgs(undefined, []));
    }),

    vscode.commands.registerCommand(
      'crosscheck.newTestFile',
      async (uri?: vscode.Uri) => {
        await newTestFile(uri);
      }
    )
  );

  // ── Phase 2 ────────────────────────────────────────────────────────────────

  // Document symbols (Outline panel / breadcrumbs)
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { pattern: '**/*.cx.yaml' },
      new CrosscheckDocumentSymbolProvider()
    )
  );

  // Test Explorer
  createTestController(context);

  // Status bar: ENV switcher + WATCH toggle
  createEnvStatusBar(context);
  createWatchStatusBar(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('crosscheck.switchEnv', () => switchEnv(context)),
    vscode.commands.registerCommand('crosscheck.toggleWatch', () => toggleWatch())
  );

  // Clear inline decorations when the active file is saved
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      const editor = vscode.window.visibleTextEditors.find(
        e => e.document === doc
      );
      if (editor && doc.fileName.endsWith('.cx.yaml')) {
        clearDecorations(editor);
      }
    })
  );

  // autoRunOnSave
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(doc => {
      if (!doc.fileName.endsWith('.cx.yaml')) return;
      const cfg = vscode.workspace.getConfiguration('crosscheck');
      if (cfg.get<boolean>('autoRunOnSave', false)) {
        spawnCx(buildArgs(doc.uri.fsPath, []));
      }
    })
  );

  // ── Phase 3 stubs ──────────────────────────────────────────────────────────

  context.subscriptions.push(
    vscode.commands.registerCommand('crosscheck.explain', () => {
      vscode.window.showInformationMessage('crosscheck: Explain panel coming in Phase 3.');
    }),
    vscode.commands.registerCommand('crosscheck.validate', () => {
      vscode.window.showInformationMessage('crosscheck: Validate integration coming in Phase 3.');
    })
  );
}

export function deactivate(): void {
  disposeWatch();
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function newTestFile(uri?: vscode.Uri): Promise<void> {
  let folder: string | undefined;

  if (uri) {
    folder = uri.fsPath;
  } else {
    const ws = vscode.workspace.workspaceFolders;
    if (!ws?.length) {
      vscode.window.showErrorMessage('crosscheck: No workspace folder open.');
      return;
    }
    folder = ws[0].uri.fsPath;
  }

  const cx = resolveCx();
  const { execSync } = await import('child_process');

  try {
    execSync(`"${cx}" init`, { cwd: folder, stdio: 'pipe' });
  } catch (err: unknown) {
    const stderr =
      err instanceof Error && 'stderr' in err
        ? (err as NodeJS.ErrnoException & { stderr: Buffer }).stderr?.toString() ?? ''
        : String(err);

    if (!stderr.includes('already exists')) {
      vscode.window.showErrorMessage(`crosscheck: ${stderr || String(err)}`);
      return;
    }
  }

  const filePath = vscode.Uri.file(path.join(folder, 'crosscheck.cx.yaml'));
  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);
}
