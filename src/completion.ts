import * as vscode from 'vscode';

// ─── Schema maps ─────────────────────────────────────────────────────────────

interface PropDef {
  label: string;
  detail: string;
  valueSnippet?: string; // inserted after the key name (includes leading space)
}

const ROOT_PROPS: PropDef[] = [
  {
    label: 'version',
    detail: 'Schema version (must be 1)',
    valueSnippet: ' 1',
  },
  {
    label: 'name',
    detail: 'Human-readable test suite name',
    valueSnippet: " '${1:suite-name}'",
  },
  {
    label: 'description',
    detail: 'Optional description',
    valueSnippet: " '${1:}'",
  },
  { label: 'env', detail: 'Environment variable defaults' },
  { label: 'mock', detail: 'Local mock HTTP server' },
  { label: 'auth', detail: 'Authentication configuration' },
  { label: 'setup', detail: 'Commands run before all tests' },
  { label: 'teardown', detail: 'Commands run after all tests' },
  { label: 'tests', detail: 'Ordered list of test steps' },
];

const DB_PROPS: PropDef[] = [
  {
    label: 'adapter',
    detail: 'Adapter type',
    valueSnippet:
      ' ${1|mysql,postgres,mongodb,redis,dynamodb,s3,sqs,sns,mock|}',
  },
  {
    label: 'query',
    detail: 'SQL query — use :param for named parameters',
    valueSnippet: " '${1:SELECT * FROM table WHERE id = :id}'",
  },
  {
    label: 'key',
    detail: 'Redis key — supports {{ VAR }} interpolation',
    valueSnippet: " '${1:key:{{ varName }}}'",
  },
  {
    label: 'path',
    detail: 'Mock server path to match (e.g. /webhook)',
    valueSnippet: " '${1:/webhook}'",
  },
  {
    label: 'method',
    detail: 'HTTP method to match on the mock server',
    valueSnippet: ' ${1|GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS|}',
  },
  { label: 'params', detail: 'Named parameter values for the query' },
  {
    label: 'wait_for',
    detail: 'Poll until assertion passes or timeout is reached',
  },
  {
    label: 'expect',
    detail: 'Expected result (rows array or key-value object)',
  },
];

const PROP_MAP: Record<string, PropDef[]> = {
  mock: [
    {
      label: 'port',
      detail: 'Port for the mock server to listen on',
      valueSnippet: ' ${1:9099}',
    },
  ],
  auth: [
    {
      label: 'type',
      detail: '"static" uses a fixed token; "login" fires a request first',
      valueSnippet: ' ${1|static,login|}',
    },
    { label: 'request', detail: 'HTTP request to perform for login auth' },
    {
      label: 'capture',
      detail: 'Variables to extract from the login response',
    },
    { label: 'inject', detail: 'How to inject the token into every request' },
  ],
  inject: [
    {
      label: 'header',
      detail: 'HTTP header name (e.g. Authorization)',
      valueSnippet: " '${1:Authorization}'",
    },
    {
      label: 'format',
      detail: 'Header value template (e.g. Bearer {{ token }})',
      valueSnippet: " '${1:Bearer {{ token }}}'",
    },
  ],
  request: [
    {
      label: 'method',
      detail: 'HTTP method',
      valueSnippet: ' ${1|GET,POST,PUT,PATCH,DELETE,HEAD,OPTIONS|}',
    },
    {
      label: 'url',
      detail: 'Request URL',
      valueSnippet: " '${1:{{ BASE_URL }}/path}'",
    },
    { label: 'headers', detail: 'Additional HTTP headers' },
    { label: 'body', detail: 'Request body (serialised as JSON)' },
  ],
  response: [
    {
      label: 'status',
      detail: 'Expected HTTP status code',
      valueSnippet: ' ${1:200}',
    },
    { label: 'headers', detail: 'Expected response headers' },
    { label: 'body', detail: 'Expected body fields' },
  ],
  tests: [
    {
      label: 'name',
      detail: 'Unique test name — used in output and --filter',
      valueSnippet: " '${1:test name}'",
    },
    {
      label: 'description',
      detail: 'Optional description',
      valueSnippet: " '${1:}'",
    },
    {
      label: 'timeout',
      detail: 'Per-test timeout (e.g. 5s)',
      valueSnippet: " '${1:5s}'",
    },
    {
      label: 'retry',
      detail: 'Number of times to retry on failure',
      valueSnippet: ' ${1:3}',
    },
    {
      label: 'retry_delay',
      detail: 'Delay between retries (e.g. 1s)',
      valueSnippet: " '${1:1s}'",
    },
    { label: 'setup', detail: 'Commands run before this test' },
    { label: 'teardown', detail: 'Commands run after this test' },
    { label: 'request', detail: 'HTTP request to perform' },
    { label: 'response', detail: 'HTTP response assertions' },
    { label: 'database', detail: 'Database assertions after the request' },
    { label: 'services', detail: 'Service assertions (Redis, mock, SQS, …)' },
  ],
  setup: [
    {
      label: 'run',
      detail: 'Shell command to execute',
      valueSnippet: " '${1:command}'",
    },
  ],
  teardown: [
    {
      label: 'run',
      detail: 'Shell command to execute',
      valueSnippet: " '${1:command}'",
    },
  ],
  wait_for: [
    {
      label: 'timeout',
      detail: 'Maximum time to wait before failing (e.g. 10s)',
      valueSnippet: " '${1:5s}'",
    },
    {
      label: 'interval',
      detail: 'How long to wait between retries (e.g. 200ms)',
      valueSnippet: " '${1:200ms}'",
    },
  ],
  database: DB_PROPS,
  services: DB_PROPS,
};

// ─── Enum values for specific keys ────────────────────────────────────────────

const VALUE_MAP: Record<string, string[]> = {
  method: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
  adapter: [
    'mysql',
    'postgres',
    'mongodb',
    'redis',
    'dynamodb',
    's3',
    'sqs',
    'sns',
    'mock',
  ],
  type: ['static', 'login'],
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export class CrosscheckCompletionProvider
  implements vscode.CompletionItemProvider
{
  provideCompletionItems(
    doc: vscode.TextDocument,
    pos: vscode.Position,
  ): vscode.CompletionItem[] {
    const line = doc.lineAt(pos).text;
    const textBefore = line.substring(0, pos.character);

    // ── Value completions: cursor is after "key: <typing>"
    const valueMatch = textBefore.match(/^\s*([\w_]+):\s+\S*$/);
    if (valueMatch) {
      const values = VALUE_MAP[valueMatch[1]];
      if (!values) return [];
      return values.map(
        (v) => new vscode.CompletionItem(v, vscode.CompletionItemKind.Value),
      );
    }

    // ── Key completions: cursor is at "  <typing>" or "  - <typing>"
    if (!/^\s*(-\s+)?[\w_]*$/.test(textBefore)) return [];

    const rawIndent = line.search(/\S/); // first non-space char (or -1 on blank line)
    const safeIndent = rawIndent < 0 ? pos.character : rawIndent;
    const parentKey = this.findParentKey(doc, pos, safeIndent);
    const props = parentKey === null ? ROOT_PROPS : PROP_MAP[parentKey];
    if (!props) return [];

    return props.map(({ label, detail, valueSnippet }) => {
      const item = new vscode.CompletionItem(
        label,
        vscode.CompletionItemKind.Field,
      );
      item.detail = detail;
      item.documentation = new vscode.MarkdownString(detail);
      if (valueSnippet) {
        item.insertText = new vscode.SnippetString(label + valueSnippet);
      }
      return item;
    });
  }

  /**
   * Scan upward from `pos` to find the nearest enclosing YAML key whose
   * indentation is strictly less than `cursorIndent`.
   *
   * - If it's a plain mapping key (`someKey:`) return that key name.
   * - If it's a list item (`- …`) look one level further up to find the
   *   key that owns the list (e.g. `tests:`, `database:`, …).
   */
  private findParentKey(
    doc: vscode.TextDocument,
    pos: vscode.Position,
    cursorIndent: number,
  ): string | null {
    for (let i = pos.line - 1; i >= 0; i--) {
      const line = doc.lineAt(i).text;
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const rawIndent = line.search(/\S/);
      if (rawIndent >= cursorIndent) continue; // same or deeper — skip

      // Plain mapping key: "  someKey:" (with optional trailing comment / blank value)
      const plainKey = line.match(/^\s*([\w_]+):\s*(?:#.*)?$/);
      if (plainKey) return plainKey[1];

      // List item marker: "  - …"
      if (trimmed.startsWith('-')) {
        // Walk further up to find the key that introduces this list
        for (let j = i - 1; j >= 0; j--) {
          const pLine = doc.lineAt(j).text;
          const pTrimmed = pLine.trim();
          if (!pTrimmed || pTrimmed.startsWith('#')) continue;
          const pRawIndent = pLine.search(/\S/);
          if (pRawIndent < rawIndent) {
            const pKey = pLine.match(/^\s*([\w_]+):\s*(?:#.*)?$/);
            if (pKey) return pKey[1];
            break;
          }
        }
        return null;
      }

      break; // unexpected structure — stop
    }
    return null; // top-level / root context
  }
}
