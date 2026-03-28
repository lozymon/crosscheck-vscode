import * as vscode from 'vscode';
import { parseContent } from './parser';

export class CrosscheckCodelensProvider implements vscode.CodeLensProvider {
  private readonly _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  refresh(): void {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(document: vscode.TextDocument): vscode.CodeLens[] {
    if (!document.fileName.endsWith('.cx.yaml')) return [];

    const { tests } = parseContent(document.getText());
    if (tests.length === 0) return [];

    const lenses: vscode.CodeLens[] = [];

    // "Run file" at the top of the document
    const topRange = new vscode.Range(0, 0, 0, 0);
    lenses.push(
      new vscode.CodeLens(topRange, {
        title: '▶ Run file',
        command: 'crosscheck.runFile',
        arguments: [document.uri.fsPath],
      })
    );

    // "Run test" above each test's name: line
    for (const test of tests) {
      const range = new vscode.Range(test.line, 0, test.line, 0);
      lenses.push(
        new vscode.CodeLens(range, {
          title: '▶ Run test',
          command: 'crosscheck.runTest',
          arguments: [document.uri.fsPath, test.name],
        })
      );
    }

    return lenses;
  }
}
