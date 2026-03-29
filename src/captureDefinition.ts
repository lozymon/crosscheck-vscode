import * as vscode from 'vscode';

// Matches:  {{ capture: varName }}
const CAPTURE_DEF = /\{\{\s*capture:\s*(\w+)\s*\}\}/g;

// Matches auth capture block entries like:
//   token: "$.accessToken"
// inside an `auth:` > `capture:` block
const AUTH_CAPTURE_ENTRY = /^(\s+)(\w+)\s*:\s*["']?\$\./;

// Matches a variable usage:  {{ varName }}  (not a capture definition)
const VAR_USAGE = /\{\{\s*(\w+)\s*\}\}/;

// Matches a SQL named parameter: :paramName (not preceded by another colon)
const SQL_PARAM_USAGE = /(?<![:\w]):(\w+)/;

export class CrosscheckCaptureDefinitionProvider
  implements vscode.DefinitionProvider
{
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Location | undefined {
    const line = document.lineAt(position).text;
    const offset = position.character;

    const text = document.getText();
    const lines = text.split('\n');

    // Check for SQL named parameter :paramName first
    const sqlParamMatch = findTokenAtOffset(line, SQL_PARAM_USAGE, offset);
    if (sqlParamMatch && !/\{\{\s*capture:/.test(line)) {
      const paramLine = findParamsEntry(lines, sqlParamMatch.group);
      if (paramLine !== -1) {
        return new vscode.Location(
          document.uri,
          new vscode.Position(paramLine, 0),
        );
      }
    }

    // Find which {{ varName }} the cursor is on
    const usageMatch = findTokenAtOffset(line, VAR_USAGE, offset);
    if (!usageMatch) return undefined;

    const varName = usageMatch.group;

    // Skip if cursor is already on a capture: definition
    if (/\{\{\s*capture:/.test(line)) return undefined;

    // 1. Look for {{ capture: varName }} in response body fields
    for (let i = 0; i < lines.length; i++) {
      CAPTURE_DEF.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = CAPTURE_DEF.exec(lines[i])) !== null) {
        if (m[1] === varName) {
          return new vscode.Location(
            document.uri,
            new vscode.Position(i, m.index),
          );
        }
      }
    }

    // 2. Look for auth.capture block entries
    const authCaptureLine = findAuthCaptureEntry(lines, varName);
    if (authCaptureLine !== -1) {
      return new vscode.Location(
        document.uri,
        new vscode.Position(authCaptureLine, 0),
      );
    }

    // 3. Look for env block entries: env:\n  VAR_NAME: value
    const envLine = findEnvEntry(lines, varName);
    if (envLine !== -1) {
      return new vscode.Location(document.uri, new vscode.Position(envLine, 0));
    }

    return undefined;
  }
}

function findTokenAtOffset(
  line: string,
  pattern: RegExp,
  offset: number,
): { group: string; start: number; end: number } | undefined {
  const re = new RegExp(pattern.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    const start = m.index;
    const end = start + m[0].length;
    if (offset >= start && offset <= end) {
      return { group: m[1], start, end };
    }
  }
  return undefined;
}

function findAuthCaptureEntry(lines: string[], varName: string): number {
  let inAuth = false;
  let inCapture = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();

    // Detect `auth:` at indent level 0
    if (/^auth\s*:/.test(line)) {
      inAuth = true;
      inCapture = false;
      continue;
    }

    if (inAuth) {
      // Detect `  capture:` inside auth block
      if (/^\s+capture\s*:/.test(line)) {
        inCapture = true;
        continue;
      }

      // Exiting auth block — next top-level key
      if (/^\S/.test(line) && !/^auth\s*:/.test(line)) {
        inAuth = false;
        inCapture = false;
        continue;
      }

      if (inCapture) {
        const m = AUTH_CAPTURE_ENTRY.exec(line);
        if (m) {
          // The key name is the second capture group
          const keyMatch = line.match(/^\s+(\w+)\s*:/);
          if (keyMatch && keyMatch[1] === varName) {
            return i;
          }
        }
        // Exiting capture block if dedented back to auth level
        if (/^\s{2}\S/.test(line) && !/^\s{4}/.test(line)) {
          inCapture = false;
        }
      }
    }
  }

  return -1;
}

function findParamsEntry(lines: string[], paramName: string): number {
  let inParams = false;
  let paramsIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const paramsMatch = line.match(/^(\s+)params\s*:/);
    if (paramsMatch) {
      inParams = true;
      paramsIndent = paramsMatch[1].length;
      continue;
    }

    if (inParams) {
      // Exit params block when dedented back to or past the params indent level
      const currentIndent = line.match(/^(\s*)/)?.[1].length ?? 0;
      if (line.trim() !== '' && currentIndent <= paramsIndent) {
        inParams = false;
        continue;
      }

      const keyMatch = line.match(/^\s+(\w+)\s*:/);
      if (keyMatch && keyMatch[1] === paramName) {
        return i;
      }
    }
  }

  return -1;
}

function findEnvEntry(lines: string[], varName: string): number {
  let inEnv = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/^env\s*:/.test(line)) {
      inEnv = true;
      continue;
    }

    if (inEnv) {
      // Exit env block on next top-level key
      if (/^\S/.test(line)) {
        inEnv = false;
        continue;
      }

      const m = line.match(/^\s+(\w+)\s*:/);
      if (m && m[1] === varName) {
        return i;
      }
    }
  }

  return -1;
}
