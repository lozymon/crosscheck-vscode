import * as child_process from 'child_process';
import * as vscode from 'vscode';
import { resolveCx } from './cx';

// cx validate output format:
//   ✗  path/to/file.cx.yaml
//      error message (may include "line N:" from YAML parser)
const FAIL_LINE = /^✗\s+(.+)$/;
const LINE_NUMBER = /\bline\s+(\d+)\b/i;

let diagnosticCollection: vscode.DiagnosticCollection | undefined;

export function getDiagnosticCollection(): vscode.DiagnosticCollection {
  if (!diagnosticCollection) {
    diagnosticCollection = vscode.languages.createDiagnosticCollection('crosscheck');
  }
  return diagnosticCollection;
}

export function validateFile(document: vscode.TextDocument): void {
  if (!document.fileName.endsWith('.cx.yaml')) return;

  const cx = resolveCx();
  const collection = getDiagnosticCollection();

  child_process.exec(
    `"${cx}" validate "${document.uri.fsPath}"`,
    (_, _stdout, stderr) => {
      // cx validate writes failures to stderr
      const output = stderr || '';
      const diagnostics = parseValidateOutput(output, document);
      collection.set(document.uri, diagnostics);
    }
  );
}

export function clearFileDiagnostics(document: vscode.TextDocument): void {
  getDiagnosticCollection().delete(document.uri);
}

function parseValidateOutput(
  output: string,
  document: vscode.TextDocument
): vscode.Diagnostic[] {
  const diagnostics: vscode.Diagnostic[] = [];
  const lines = output.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const failMatch = FAIL_LINE.exec(lines[i]);
    if (!failMatch) continue;

    // The error message follows on the next indented line(s)
    const msgLines: string[] = [];
    for (let j = i + 1; j < lines.length; j++) {
      if (lines[j].startsWith('  ') || lines[j].startsWith('\t')) {
        msgLines.push(lines[j].trim());
      } else {
        break;
      }
    }

    const message = msgLines.join(' ') || 'Validation error';

    // Best-effort: extract a line number from the error message
    const lineMatch = LINE_NUMBER.exec(message);
    const lineNumber = lineMatch ? Math.max(0, parseInt(lineMatch[1], 10) - 1) : 0;

    const pos = new vscode.Position(lineNumber, 0);
    const range = document.lineAt(lineNumber).range ?? new vscode.Range(pos, pos);

    const diag = new vscode.Diagnostic(
      range,
      message,
      vscode.DiagnosticSeverity.Error
    );
    diag.source = 'crosscheck';
    diagnostics.push(diag);
  }

  return diagnostics;
}
