import * as vscode from 'vscode';

export interface FailureHint {
  line: number;
  message: string;
}

// Track decorations per editor so we can clear them individually
const activeDecorations = new WeakMap<
  vscode.TextEditor,
  vscode.TextEditorDecorationType[]
>();

export function applyDecorations(
  editor: vscode.TextEditor,
  failures: FailureHint[],
): void {
  clearDecorations(editor);

  if (failures.length === 0) return;

  // Build one decoration type per failure so each has its own `after` text
  const types: vscode.TextEditorDecorationType[] = [];

  for (const f of failures) {
    const type = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: new vscode.ThemeColor('testing.iconFailed'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      backgroundColor: new vscode.ThemeColor('inputValidation.errorBackground'),
      borderRadius: '2px',
    });

    const line = editor.document.lineAt(
      Math.min(f.line, editor.document.lineCount - 1),
    );
    const range = new vscode.Range(line.range.end, line.range.end);

    const hoverMessage = new vscode.MarkdownString(
      `**crosscheck failure**\n\n\`\`\`\n${f.message}\n\`\`\``,
    );
    hoverMessage.isTrusted = true;

    editor.setDecorations(type, [{ range, hoverMessage }]);
    types.push(type);
  }

  activeDecorations.set(editor, types);
}

export function clearDecorations(editor: vscode.TextEditor): void {
  const types = activeDecorations.get(editor);
  if (types) {
    types.forEach((t) => t.dispose());
    activeDecorations.delete(editor);
  }
}

export function clearAllDecorations(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    clearDecorations(editor);
  }
}
