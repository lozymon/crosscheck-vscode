# crosscheck VS Code Extension — Design Plan

> Companion extension for [crosscheck](https://github.com/lozymon/crosscheck) (`cx`), the end-to-end API test CLI. Adds editor-native support for `.cx.yaml` test files.

---

## What This Extension Does

Makes writing and running crosscheck tests feel first-class inside VS Code:

- Syntax highlighting for `{{ VAR }}`, `:namedParam`, and YAML top-level keys
- Schema-driven autocomplete and inline validation via `yaml-language-server`
- CodeLens "▶ Run test" button above every test block
- VS Code native Test Explorer (sidebar pass/fail/skip tree)
- Inline failure decorations (red gutter icon + hover showing expected vs actual)
- Status bar environment switcher (`.env`, `.env.staging`, `.env.prod`, …)
- `cx explain` side panel — plain-English summary of the current file
- DB query hover preview — renders SQL with params substituted

---

## Repository

```
github.com/lozymon/crosscheck-vscode
```

Separate from the CLI repo (`lozymon/crosscheck`) because:

- Different tech stack: TypeScript + Node.js vs Go
- Independent release cycle (VS Code Marketplace vs GitHub Releases)
- Different CI/CD (vsce publish vs goreleaser)

---

## Tech Stack

| Concern             | Choice                                                             |
| ------------------- | ------------------------------------------------------------------ |
| Language            | TypeScript                                                         |
| VS Code API         | `vscode` npm package (peer dep, provided by host)                  |
| Build               | `esbuild` — single bundled `.js`, fast incremental builds          |
| Grammar             | TextMate JSON grammar (`.tmLanguage.json`)                         |
| Schema autocomplete | `yaml-language-server` — points at `crosscheck.schema.json`        |
| YAML parsing        | `yaml` npm package — parse `.cx.yaml` for CodeLens / Test Explorer |
| Test framework      | `@vscode/test-cli` + `mocha`                                       |
| Linting             | ESLint + `@typescript-eslint`                                      |
| Release             | `@vscode/vsce` — packages and publishes to VS Code Marketplace     |

---

## Directory Structure

```
crosscheck-vscode/
├── package.json               # Extension manifest + contributes
├── tsconfig.json
├── esbuild.js                 # Build script
├── .eslintrc.json
├── .vscodeignore
├── CHANGELOG.md
├── README.md
├── src/
│   ├── extension.ts           # activate() entry point
│   ├── codelens.ts            # CodeLens provider — "▶ Run test"
│   ├── testExplorer.ts        # VS Code Test Explorer integration
│   ├── decorations.ts         # Inline failure decorations
│   ├── statusBar.ts           # Environment switcher
│   ├── explainPanel.ts        # cx explain side panel (WebviewPanel)
│   ├── queryPreview.ts        # DB query hover provider
│   └── parser.ts              # Shared YAML parser + test tree builder
├── syntaxes/
│   └── crosscheck.tmLanguage.json   # TextMate grammar
└── test/
    ├── suite/
    │   ├── codelens.test.ts
    │   ├── parser.test.ts
    │   └── decorations.test.ts
    └── runTests.ts
```

---

## Feature Design

### 1. TextMate Grammar

Injected into YAML files. Scopes:

| Token                        | Scope                                 |
| ---------------------------- | ------------------------------------- |
| `{{ VAR }}`                  | `variable.other.crosscheck`           |
| `{{ capture: varName }}`     | `variable.other.capture.crosscheck`   |
| `:namedParam` in SQL strings | `variable.parameter.named.crosscheck` |
| Top-level keys               | `keyword.control.crosscheck`          |
| `auth:` block keys           | `keyword.control.auth.crosscheck`     |

Grammar is injected with `scopeName: source.cx.yaml` scoped to `*.cx.yaml` files — it does not override standard YAML tokenisation.

### 2. Schema Autocomplete

`package.json` contributes a `yaml.schemas` entry pointing at `crosscheck.schema.json` for `**/*.cx.yaml` globs. No custom language server needed — `yaml-language-server` (shipped by the Red Hat YAML extension) handles it.

The schema file (`crosscheck.schema.json`) is bundled directly from the CLI repo — it lives at `lozymon/crosscheck`. No CDN fetch needed; bundle it at release time and keep it in sync with CLI version tags.

The extension declares `redhat.vscode-yaml` as a recommended (not required) dependency in `package.json#extensionDependencies`.

### 3. CodeLens — "▶ Run test"

- Registered for `**/*.cx.yaml` via `vscode.languages.registerCodeLensProvider`
- `parser.ts` walks the parsed YAML document and finds every `- name:` entry under `tests:`
- Each produces a `CodeLens` at the line of that `name:` key
- Command: `crosscheck.runTest` — shells out `cx run <file> --filter "<name>"`
- Output goes to a dedicated `OutputChannel` named `crosscheck`

### 4. VS Code Test Explorer

Uses `vscode.TestController` (native test API, VS Code 1.59+):

- `createTestItem` per suite (file) and per test (`name:` entry)
- `TestRunRequest` / `TestRun` to report results
- "Run File" / "Run Test": `cx run --reporter json --output-file <tmpfile> <file>` — one process per file
- "Run All": spawn one `cx` process **per file** sequentially and merge results — CLI only writes last file to `--output-file` (merged JSON is a CLI Phase 2 item)
- Maps pass/fail/error back to test items by name
- Supports "Run All", "Run File", "Run Test" from the sidebar
- Exit code handling: `0` = pass, `1` = test failures, `2` = YAML error, `3` = connection error — surface exit code 2/3 as suite-level errors, not individual test failures
- Show `attempts` count in test message when `> 1` (e.g. "passed on attempt 3")

### 5. Inline Failure Decorations

- After a test run, parse the JSON result file
- For each failure, find the line in the document that corresponds to the failing assertion key (e.g. `status:` under `response:`)
- Apply a `TextEditorDecorationType`: red gutter icon + `after` pseudo-element showing `expected: X  actual: Y`
- Hover `MarkdownString` shows full expected vs actual diff
- Decorations are cleared on next run or on file save

### 6. Environment Switcher (Status Bar)

- Status bar item (right side, priority 100): `$(gear) ENV: .env`
- Click opens `QuickPick` listing all `.env*` files in the workspace root
- Selection stored in `WorkspaceState` (`context.workspaceState.update`)
- Active env file is passed as `--env-file <path>` to all `cx` invocations

### 7. `cx explain` Side Panel

- Command: `crosscheck.explain` — triggered from Command Palette or CodeLens
- Opens a `WebviewPanel` (`column: Beside`)
- Shells out `cx explain <currentFile>` — output is plain text (structured narrative, not JSON/markdown)
- Render output in a `<pre>` block with monospace font; apply minimal CSS for readability
- Webview is refreshed on file save

### 8. DB Query Hover Preview

- `vscode.languages.registerHoverProvider` for `**/*.cx.yaml`
- On hover over a `query:` value, the parser resolves `:namedParam` substitutions using the `params:` sibling block and values from the active `.env` file
- Result rendered as a fenced SQL code block in a `Hover` markdown string

### 9. Watch Mode

- `crosscheck.toggleWatch` command — starts/stops `cx run --watch <file>`
- Status bar item updates to `$(eye) WATCH` when active
- Stdout from the watch process feeds the existing `OutputChannel`
- Stopping watch kills the child process; toggling restarts it for the current file

### 10. New Test File

- `crosscheck.newTestFile` shells out to `cx init` in the target directory
- Opens the created file in the editor automatically
- Triggered from Command Palette and Explorer right-click (`when: explorerResourceIsFolder`)

### 11. Captured Variable Go-to-Definition

- `src/captureDefinition.ts` — `DefinitionProvider` for `**/*.cx.yaml`
- Resolves `{{ varName }}` usages to their capture site
- Capture sites: `{{ capture: varName }}` in `response.body` fields, and `auth.capture` key names
- Works within the same file; cross-file resolution deferred

---

## Extension Activation

```json
"activationEvents": [
  "onLanguage:yaml",
  "workspaceContains:**/*.cx.yaml"
]
```

Activates only when a `.cx.yaml` file is present — zero overhead in unrelated projects.

---

## `cx` Binary Resolution

The extension needs to invoke `cx` from the user's PATH. Resolution order:

1. `crosscheck.executablePath` workspace setting (explicit override)
2. `which cx` / `where cx` (PATH lookup)
3. Common install paths: `~/.local/bin/cx`, `/usr/local/bin/cx`

If `cx` is not found, a notification offers to open the install docs.

---

## Settings Contributed

```json
"crosscheck.executablePath": {
  "type": "string",
  "default": "",
  "description": "Path to the cx binary. Leave empty to use PATH."
},
"crosscheck.defaultEnvFile": {
  "type": "string",
  "default": ".env",
  "description": "Default .env file used for cx invocations."
},
"crosscheck.autoRunOnSave": {
  "type": "boolean",
  "default": false,
  "description": "Automatically re-run tests for the active file on save."
},
"crosscheck.insecure": {
  "type": "boolean",
  "default": false,
  "description": "Pass --insecure to cx, skipping TLS certificate verification."
}
```

---

## Commands Contributed

| Command ID               | Title                          | When                       |
| ------------------------ | ------------------------------ | -------------------------- |
| `crosscheck.runTest`     | crosscheck: Run Test           | `.cx.yaml` file open       |
| `crosscheck.runFile`     | crosscheck: Run File           | `.cx.yaml` file open       |
| `crosscheck.runAll`      | crosscheck: Run All Tests      | always                     |
| `crosscheck.explain`     | crosscheck: Explain This File  | `.cx.yaml` file open       |
| `crosscheck.switchEnv`   | crosscheck: Switch Environment | always                     |
| `crosscheck.validate`    | crosscheck: Validate File      | `.cx.yaml` file open       |
| `crosscheck.newTestFile` | crosscheck: New Test File      | always (Explorer ctx menu) |
| `crosscheck.toggleWatch` | crosscheck: Toggle Watch Mode  | always                     |

---

## Release & Publishing

- Versioning: `MAJOR.MINOR.PATCH` aligned loosely with CLI milestones
- Marketplace publisher: `lozymon`
- Extension ID: `lozymon.crosscheck`
- CI: GitHub Actions — lint + test on push, `vsce publish` on tag
- `CHANGELOG.md` maintained per VS Code Marketplace convention

---

## Open Questions

_(none — all decisions resolved for Phase 1)_
