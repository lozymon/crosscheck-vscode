import * as vscode from 'vscode';

// Matches a `query:` value on the hovered line
const QUERY_LINE = /^\s*query\s*:\s*["']?(.+?)["']?\s*$/;

// Matches :paramName placeholders in SQL
const NAMED_PARAM = /:([a-zA-Z_]\w*)/g;

// Matches `  key: "value"` inside a params block
const PARAM_ENTRY = /^\s+(\w+)\s*:\s*["']?(.+?)["']?\s*$/;

// Matches `{{ VAR }}` for display substitution
const VAR_INTERP = /\{\{\s*(\w+)\s*\}\}/g;

export class CrosscheckQueryPreviewProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position
  ): vscode.Hover | undefined {
    const line = document.lineAt(position).text;
    const queryMatch = QUERY_LINE.exec(line);
    if (!queryMatch) return undefined;

    const rawQuery = queryMatch[1].trim();
    const params = collectParams(document, position.line);
    const rendered = substituteParams(rawQuery, params);

    const md = new vscode.MarkdownString();
    md.appendCodeblock(rendered, 'sql');
    if (Object.keys(params).length > 0) {
      md.appendMarkdown('\n\n**params:** ' +
        Object.entries(params)
          .map(([k, v]) => `\`${k}\` = \`${v}\``)
          .join(', ')
      );
    }
    md.isTrusted = true;

    return new vscode.Hover(md, document.lineAt(position).range);
  }
}

/**
 * Walk backward and forward from the `query:` line to find the sibling
 * `params:` block and collect its key/value pairs.
 */
function collectParams(
  document: vscode.TextDocument,
  queryLineIndex: number
): Record<string, string> {
  const lines = document.getText().split('\n');
  const params: Record<string, string> = {};

  // Determine the indent level of the `query:` line (find its parent block)
  const queryIndent = lines[queryLineIndex].match(/^(\s*)/)?.[1].length ?? 0;

  // Search within the same adapter block: scan nearby lines for `params:`
  let paramsStart = -1;

  // Look downward first (params usually follows query)
  for (let i = queryLineIndex + 1; i < Math.min(queryLineIndex + 20, lines.length); i++) {
    const l = lines[i];
    const indent = l.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent <= queryIndent && l.trim() !== '') break; // left the block
    if (/^\s*params\s*:/.test(l)) { paramsStart = i; break; }
  }

  // If not found below, look upward
  if (paramsStart === -1) {
    for (let i = queryLineIndex - 1; i >= Math.max(0, queryLineIndex - 20); i--) {
      const l = lines[i];
      const indent = l.match(/^(\s*)/)?.[1].length ?? 0;
      if (indent <= queryIndent && l.trim() !== '') break;
      if (/^\s*params\s*:/.test(l)) { paramsStart = i; break; }
    }
  }

  if (paramsStart === -1) return params;

  // Collect key/value pairs under `params:`
  const paramsIndent = lines[paramsStart].match(/^(\s*)/)?.[1].length ?? 0;
  for (let i = paramsStart + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.trim() === '') continue;
    const indent = l.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent <= paramsIndent) break;
    const m = PARAM_ENTRY.exec(l);
    if (m) params[m[1]] = m[2].trim();
  }

  return params;
}

/**
 * Replace :paramName with the resolved value (or keep as-is if unknown).
 * Also strips {{ VAR }} wrappers from param values for readability.
 */
function substituteParams(query: string, params: Record<string, string>): string {
  return query.replace(NAMED_PARAM, (_, name) => {
    if (!(name in params)) return `:${name}`;
    // Unwrap {{ VAR }} to just VAR for display
    const val = params[name].replace(VAR_INTERP, '$1');
    return `'${val}'`;
  });
}
