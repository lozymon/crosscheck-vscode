# crosscheck for VS Code

VS Code extension for [crosscheck](https://github.com/lozymon/crosscheck) (`cx`) — the end-to-end API test CLI. Makes writing and running `.cx.yaml` test files feel first-class inside the editor.

## Features

### Syntax highlighting

`{{ VAR }}`, `{{ capture: varName }}`, and `:namedParam` placeholders are highlighted inside `.cx.yaml` files. Top-level structural keys (`request:`, `response:`, `database:`, etc.) are also scoped for theme coloring.

### Schema autocomplete & validation

Full autocomplete and inline validation for all `.cx.yaml` fields — HTTP methods, adapter names, duration formats, required fields — powered by the bundled JSON schema and the [YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml).

### CodeLens — ▶ Run test

A **▶ Run file** lens appears at the top of every `.cx.yaml` file. A **▶ Run test** lens appears above each individual test. Clicking either streams `cx` output to the **crosscheck** output panel.

### Snippets

| Prefix           | Inserts                                  |
| ---------------- | ---------------------------------------- |
| `cx-test`        | Minimal test block                       |
| `cx-test-body`   | Test block with request body and capture |
| `cx-db`          | Database assertion                       |
| `cx-db-wait`     | Database assertion with async polling    |
| `cx-auth-login`  | Login-based auth block                   |
| `cx-auth-static` | Static token auth block                  |

### New test file

Run **crosscheck: New Test File** from the Command Palette or right-click a folder in the Explorer to scaffold a commented starter file via `cx init`.

## Requirements

- [`cx`](https://github.com/lozymon/crosscheck) installed and on your PATH (or set `crosscheck.executablePath`)
- [YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) for schema-driven autocomplete (recommended, not required)

## Settings

| Setting                     | Default  | Description                                                 |
| --------------------------- | -------- | ----------------------------------------------------------- |
| `crosscheck.executablePath` | `""`     | Path to the `cx` binary. Leave empty to use PATH.           |
| `crosscheck.defaultEnvFile` | `".env"` | `.env` file passed as `--env-file` to all `cx` invocations. |
| `crosscheck.autoRunOnSave`  | `false`  | Re-run tests for the active file on save. _(Phase 2)_       |
| `crosscheck.insecure`       | `false`  | Pass `--insecure` to `cx`, skipping TLS verification.       |

## Commands

| Command                          | Description                                               |
| -------------------------------- | --------------------------------------------------------- |
| `crosscheck: Run Test`           | Run the test under the cursor                             |
| `crosscheck: Run File`           | Run all tests in the active file                          |
| `crosscheck: Run All Tests`      | Run all `*.cx.yaml` files in the workspace                |
| `crosscheck: New Test File`      | Scaffold a `crosscheck.cx.yaml` starter file              |
| `crosscheck: Switch Environment` | Switch active `.env` file _(Phase 2)_                     |
| `crosscheck: Toggle Watch Mode`  | Start/stop `cx run --watch` _(Phase 2)_                   |
| `crosscheck: Explain This File`  | Open a plain-English summary panel _(Phase 3)_            |
| `crosscheck: Validate File`      | Run `cx validate` and show errors in Problems _(Phase 3)_ |

## Installation

Install from the VS Code Marketplace:

```
ext install lozymon.crosscheck
```

Or download the `.vsix` from the [releases page](https://github.com/lozymon/crosscheck-vscode/releases) and run:

```bash
code --install-extension crosscheck-*.vsix
```
