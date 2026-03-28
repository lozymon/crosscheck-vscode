# crosscheck VS Code Extension — Roadmap

> Build tracker. See [PLAN.md](PLAN.md) for design decisions and architecture rationale.

---

## Phase 1 — Foundation

### Project setup

- [x] `package.json` — extension manifest, contributes, scripts; `engines.vscode: "^1.75.0"`
- [x] `tsconfig.json`
- [x] `esbuild.js` build script
- [x] `.eslintrc.json` + `@typescript-eslint`
- [x] `.vscodeignore`
- [x] `src/extension.ts` — `activate()` / `deactivate()` entry point
- [x] GitHub Actions CI — lint + build on push
- [x] `README.md` with install + feature overview

### Syntax highlighting

- [x] TextMate grammar (`syntaxes/crosscheck.tmLanguage.json`)
  - [x] `{{ VAR }}` — `variable.other.crosscheck`
  - [x] `{{ capture: varName }}` — `variable.other.capture.crosscheck`
  - [x] `:namedParam` in SQL strings — `variable.parameter.named.crosscheck`
  - [x] Top-level keys (`request:`, `response:`, `database:`, `services:`, `setup:`, `teardown:`, `auth:`) — `keyword.control.crosscheck`
- [x] Grammar injected into `*.cx.yaml` files only

### Schema autocomplete

- [x] `yaml.schemas` contribution in `package.json` pointing at `crosscheck.schema.json` for `**/*.cx.yaml`
- [x] Bundle `crosscheck.schema.json` locally (copied from CLI repo)
- [x] Declare `redhat.vscode-yaml` as recommended extension (`.vscode/extensions.json`)

### CodeLens — "▶ Run test"

- [x] `src/parser.ts` — YAML parser that returns test names + line numbers
- [x] `src/codelens.ts` — `CodeLensProvider` registered for `**/*.cx.yaml`
- [x] `crosscheck.runTest` command — runs `cx run <file> --filter "<name>"`
- [x] `crosscheck.runFile` command — runs `cx run <file>`
- [x] Dedicated `OutputChannel` named `crosscheck`
- [x] `crosscheck.executablePath` setting + PATH resolution fallback
- [x] `crosscheck.insecure` setting — passes `--insecure` to all `cx` invocations
- [x] Run `cx --version` on activation — warn if version is below minimum supported

### Snippets

- [x] `snippets/crosscheck.json` — snippet contributions for `**/*.cx.yaml`
  - [x] `cx-test` — minimal test block scaffold (`name:`, `request:`, `response:`)
  - [x] `cx-test-body` — test block with request body and capture
  - [x] `cx-db` — database assertion block scaffold
  - [x] `cx-db-wait` — database assertion with async polling
  - [x] `cx-auth-login` — login auth block scaffold
  - [x] `cx-auth-static` — static token auth block scaffold

### New test file command

- [x] `crosscheck.newTestFile` command — shells out to `cx init` in the target directory
- [x] Opens the created file in the editor automatically
- [x] Triggered from Command Palette and Explorer context menu (`when: explorerResourceIsFolder`)

---

## Phase 2 — Test Explorer + Results

### Document Symbols (Outline)

- [x] `src/symbols.ts` — `DocumentSymbolProvider` registered for `**/*.cx.yaml`
- [x] Each `name:` entry exposed as a `SymbolKind.Function` symbol
- [x] Test names appear in VS Code Outline panel and breadcrumbs

### VS Code Test Explorer

- [x] `src/testExplorer.ts` — `vscode.TestController` integration
- [x] Build test tree: suite (file) → test items (`name:` entries)
- [x] `crosscheck.runAll` command
- [x] "Run File" / "Run Test": `cx run --reporter json --output-file <tmpfile> <file>` — one process per file
- [x] "Run All": spawn one `cx` process per file sequentially and merge results
- [x] Map pass/fail/error to test items by name — exit code 2/3 surfaces as suite error
- [x] Show retry attempt count in test message when `attempts > 1`
- [x] Support "Run All", "Run File", "Run Test" from sidebar

### Inline failure decorations

- [x] `src/decorations.ts` — `TextEditorDecorationType` for failures
- [x] Red gutter icon on failing assertion line
- [x] `after` pseudo-element: `expected: X  actual: Y`
- [x] Hover `MarkdownString` with full expected vs actual
- [x] Clear decorations on next run or file save

### Environment switcher

- [x] `src/statusBar.ts` — status bar item `$(gear) ENV: .env`
- [x] `QuickPick` listing `.env*` files in workspace root
- [x] Active env stored in `WorkspaceState`
- [x] `--env-file <path>` passed to all `cx` invocations
- [x] `crosscheck.switchEnv` command

### Watch mode

- [x] `crosscheck.toggleWatch` command — starts/stops `cx run --watch <file>`
- [x] Status bar item updates to `$(eye) WATCH` when active
- [x] Watch output streamed to the existing `crosscheck` OutputChannel
- [x] Toggle kills/restarts child process for the current file

---

## Phase 3 — Rich Features

### `cx explain` side panel

- [ ] `src/explainPanel.ts` — `WebviewPanel` (column: Beside)
- [ ] `crosscheck.explain` command
- [ ] Shell out `cx explain <currentFile>` — render plain-text output in `<pre>` block with monospace CSS
- [ ] Refresh on file save

### Captured variable go-to-definition

- [ ] `src/captureDefinition.ts` — `DefinitionProvider` for `**/*.cx.yaml`
- [ ] On go-to-definition of `{{ varName }}`, resolve to the `{{ capture: varName }}` site
- [ ] Also resolves variables captured in `auth.capture` block
- [ ] Works within the same file; cross-file support deferred

### DB query hover preview

- [ ] `src/queryPreview.ts` — `HoverProvider` for `**/*.cx.yaml`
- [ ] Resolve `:namedParam` substitutions from `params:` sibling block
- [ ] Render rendered SQL as fenced code block in hover markdown

### `cx validate` integration

- [ ] `crosscheck.validate` command — runs `cx validate <file>`, shows errors in Problems panel
- [ ] Wire to `vscode.languages.createDiagnosticCollection`
- [ ] Parse plain-text output: `✗  <file>\n   <message>` — regex-extract `line N` from message for best-effort line-level diagnostics; fall back to line 1
- [ ] Run validate on file open and save

### `autoRunOnSave` setting

- [x] `crosscheck.autoRunOnSave` workspace setting
- [x] Re-run file tests on save when enabled

---

## Phase 4 — Polish & Release

### Publishing

- [ ] `CHANGELOG.md`
- [ ] Extension icon (`icon.png`)
- [ ] VS Code Marketplace listing (publisher: `lozymon`, ID: `lozymon.crosscheck`)
- [ ] GitHub Actions release workflow — `vsce publish` on git tag
- [ ] `vsce package` produces `.vsix` for manual installs

### Tests

- [ ] `test/suite/parser.test.ts` — parser unit tests
- [ ] `test/suite/codelens.test.ts` — CodeLens provider tests
- [ ] `test/suite/decorations.test.ts` — decoration mapping tests
- [ ] CI runs tests on push

---
