import * as vscode from 'vscode';

export interface FailureHint {
  line: number;
  message: string;
}

const failureDecorationType = vscode.window.createTextEditorDecorationType({
  gutterIconPath: new vscode.ThemeIcon('testing-failed-icon').id as never,
  overviewRulerColor: new vscode.ThemeColor('testing.iconFailed'),
  overviewRulerLane: vscode.OverviewRulerLane.Right,
  after: {
    color: new vscode.ThemeColor('editorCodeLens.foreground'),
    margin: '0 0 0 2em',
  },
});

// Track decorations per editor so we can clear them individually
const activeDecorations = new WeakMap<vscode.TextEditor, vscode.TextEditorDecorationType[]>();

export function applyDecorations(
  editor: vscode.TextEditor,
  failures: FailureHint[]
): void {
  clearDecorations(editor);

  if (failures.length === 0) return;

  // Build one decoration type per failure so each has its own `after` text
  const types: vscode.TextEditorDecorationType[] = [];

  for (const f of failures) {
    // Truncate long messages so they don't swamp the line
    const truncated = f.message.length > 80 ? f.message.slice(0, 77) + '…' : f.message;

    const type = vscode.window.createTextEditorDecorationType({
      overviewRulerColor: new vscode.ThemeColor('testing.iconFailed'),
      overviewRulerLane: vscode.OverviewRulerLane.Right,
      after: {
        contentText: `  ${truncated}`,
        color: new vscode.ThemeColor('editorCodeLens.foreground'),
      },
      gutterIconSize: 'contain',
    });

    const pos = new vscode.Position(f.line, 0);
    const range = new vscode.Range(pos, pos);

    const hoverMessage = new vscode.MarkdownString(
      `**crosscheck failure**\n\n\`\`\`\n${f.message}\n\`\`\``
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
    types.forEach(t => t.dispose());
    activeDecorations.delete(editor);
  }
}

export function clearAllDecorations(): void {
  for (const editor of vscode.window.visibleTextEditors) {
    clearDecorations(editor);
  }
}
