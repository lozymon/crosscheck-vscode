import * as path from 'path';
import * as vscode from 'vscode';
import { CrosscheckCodelensProvider } from './codelens';
import { buildArgs, checkVersion, resolveCx, spawnCx } from './cx';

export function activate(context: vscode.ExtensionContext): void {
  checkVersion();

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
    ),

    // Phase 2/3 commands — registered now so users can discover them
    vscode.commands.registerCommand('crosscheck.explain', () => {
      vscode.window.showInformationMessage('crosscheck: Explain panel coming in Phase 3.');
    }),
    vscode.commands.registerCommand('crosscheck.switchEnv', () => {
      vscode.window.showInformationMessage('crosscheck: Environment switcher coming in Phase 2.');
    }),
    vscode.commands.registerCommand('crosscheck.validate', () => {
      vscode.window.showInformationMessage('crosscheck: Validate integration coming in Phase 3.');
    }),
    vscode.commands.registerCommand('crosscheck.toggleWatch', () => {
      vscode.window.showInformationMessage('crosscheck: Watch mode coming in Phase 2.');
    })
  );
}

export function deactivate(): void {
  // nothing to clean up — subscriptions are disposed automatically
}

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

    // cx init exits non-zero only if the file already exists — open it anyway
    if (!stderr.includes('already exists')) {
      vscode.window.showErrorMessage(`crosscheck: ${stderr || String(err)}`);
      return;
    }
  }

  const filePath = vscode.Uri.file(path.join(folder, 'crosscheck.cx.yaml'));
  const doc = await vscode.workspace.openTextDocument(filePath);
  await vscode.window.showTextDocument(doc);
}
