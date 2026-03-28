import * as vscode from 'vscode';
import { parseContent } from './parser';

export class CrosscheckDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(document: vscode.TextDocument): vscode.DocumentSymbol[] {
    if (!document.fileName.endsWith('.cx.yaml')) return [];

    const { tests } = parseContent(document.getText());
    return tests.map(test => {
      const pos = new vscode.Position(test.line, 0);
      const range = new vscode.Range(pos, pos);
      return new vscode.DocumentSymbol(
        test.name,
        '',
        vscode.SymbolKind.Function,
        range,
        range
      );
    });
  }
}
