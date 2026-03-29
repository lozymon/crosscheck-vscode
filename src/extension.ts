import * as path from 'path';
import * as vscode from 'vscode';
import { CrosscheckCaptureDefinitionProvider } from './captureDefinition';
import { CrosscheckCodelensProvider } from './codelens';
import { CrosscheckCompletionProvider } from './completion';
import { buildArgs, checkVersion, resolveCx, spawnCx } from './cx';
import { clearDecorations } from './decorations';
import { showExplainPanel, refreshExplainPanel } from './explainPanel';
import { CrosscheckQueryPreviewProvider } from './queryPreview';
import { CrosscheckDocumentSymbolProvider } from './symbols';
import { createTestController } from './testExplorer';
import {
  validateFile,
  clearFileDiagnostics,
  getDiagnosticCollection,
} from './validate';
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
    vscode.languages.registerCodeLensProvider(
      { pattern: '**/*.cx.yaml' },
      codelens,
    ),

    vscode.commands.registerCommand(
      'crosscheck.runTest',
      (file: string, testName: string) => {
        spawnCx(buildArgs(file, ['--filter', testName]));
      },
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
      },
    ),
  );

  // ── Phase 2 ────────────────────────────────────────────────────────────────

  // Document symbols (Outline panel / breadcrumbs)
  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { pattern: '**/*.cx.yaml' },
      new CrosscheckDocumentSymbolProvider(),
    ),
  );

  // Test Explorer
  createTestController(context);

  // Status bar: ENV switcher + WATCH toggle
  createEnvStatusBar(context);
  createWatchStatusBar(context);

  context.subscriptions.push(
    vscode.commands.registerCommand('crosscheck.switchEnv', () =>
      switchEnv(context),
    ),
    vscode.commands.registerCommand('crosscheck.toggleWatch', () =>
      toggleWatch(),
    ),
  );

  // Clear inline decorations when the active file is saved
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      const editor = vscode.window.visibleTextEditors.find(
        (e) => e.document === doc,
      );
      if (editor && doc.fileName.endsWith('.cx.yaml')) {
        clearDecorations(editor);
      }
    }),
  );

  // autoRunOnSave
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!doc.fileName.endsWith('.cx.yaml')) return;
      const cfg = vscode.workspace.getConfiguration('crosscheck');
      if (cfg.get<boolean>('autoRunOnSave', false)) {
        spawnCx(buildArgs(doc.uri.fsPath, []));
      }
    }),
  );

  // ── Phase 3 ────────────────────────────────────────────────────────────────

  // cx explain side panel
  context.subscriptions.push(
    vscode.commands.registerCommand('crosscheck.explain', () => {
      const file = vscode.window.activeTextEditor?.document.uri.fsPath;
      if (!file?.endsWith('.cx.yaml')) {
        vscode.window.showInformationMessage(
          'crosscheck: Open a .cx.yaml file to explain.',
        );
        return;
      }
      showExplainPanel(file);
    }),
  );

  // Refresh explain panel on save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (doc.fileName.endsWith('.cx.yaml')) {
        refreshExplainPanel(doc.uri.fsPath);
      }
    }),
  );

  // Go-to-definition for {{ varName }} captures
  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { pattern: '**/*.cx.yaml' },
      new CrosscheckCaptureDefinitionProvider(),
    ),
  );

  // Schema-aware autocomplete for *.cx.yaml (keys + enum values)
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { pattern: '**/*.cx.yaml' },
      new CrosscheckCompletionProvider(),
      ':',
      ' ', // trigger on these characters too
    ),
  );

  // DB query hover preview
  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { pattern: '**/*.cx.yaml' },
      new CrosscheckQueryPreviewProvider(),
    ),
  );

  // cx validate — run on open and save
  context.subscriptions.push(getDiagnosticCollection());

  vscode.workspace.textDocuments.forEach((doc) => validateFile(doc));

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((doc) => validateFile(doc)),
    vscode.workspace.onDidSaveTextDocument((doc) => validateFile(doc)),
    vscode.workspace.onDidCloseTextDocument((doc) => clearFileDiagnostics(doc)),
    vscode.commands.registerCommand('crosscheck.validate', () => {
      const doc = vscode.window.activeTextEditor?.document;
      if (doc) validateFile(doc);
    }),
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
        ? ((
            err as NodeJS.ErrnoException & { stderr: Buffer }
          ).stderr?.toString() ?? '')
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
