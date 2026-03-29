import * as path from 'path';
import * as vscode from 'vscode';
import { setActiveEnvFile } from './cx';

const ENV_STATE_KEY = 'crosscheck.activeEnvFile';

export class EnvTreeProvider implements vscode.TreeDataProvider<EnvItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<
    EnvItem | undefined | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private envFiles: vscode.Uri[] = [];
  private activeFile: string;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.activeFile = this.getActiveEnvFile();
    setActiveEnvFile(this.activeFile);
    this.refresh();
  }

  // ── public API ──────────────────────────────────────────────────────────────

  async refresh(): Promise<void> {
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri;
    if (!workspaceRoot) {
      this.envFiles = [];
    } else {
      this.envFiles = await vscode.workspace.findFiles(
        new vscode.RelativePattern(workspaceRoot, '.env*'),
        '**/node_modules/**',
      );
      this.envFiles.sort((a, b) =>
        path.basename(a.fsPath).localeCompare(path.basename(b.fsPath)),
      );
    }
    this._onDidChangeTreeData.fire();
  }

  async selectEnv(item: EnvItem): Promise<void> {
    if (item.fsPath === this.activeFile) return;
    this.activeFile = item.fsPath;
    await this.context.workspaceState.update(ENV_STATE_KEY, item.fsPath);
    setActiveEnvFile(item.fsPath);
    this._onDidChangeTreeData.fire();
  }

  getActiveEnvFile(): string {
    const stored = this.context.workspaceState.get<string>(ENV_STATE_KEY);
    if (stored) return stored;
    const config = vscode.workspace.getConfiguration('crosscheck');
    return config.get<string>('defaultEnvFile', '.env');
  }

  // ── TreeDataProvider ─────────────────────────────────────────────────────

  getTreeItem(element: EnvItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: EnvItem): EnvItem[] {
    if (element) return [];

    return this.envFiles.map((uri) => {
      const fsPath = uri.fsPath;
      const label = path.basename(fsPath);
      const isActive = fsPath === this.activeFile;

      const item = new EnvItem(
        label,
        fsPath,
        vscode.TreeItemCollapsibleState.None,
      );
      item.description = isActive ? 'active' : '';
      item.iconPath = new vscode.ThemeIcon(
        isActive ? 'check' : 'circle-outline',
        isActive ? new vscode.ThemeColor('testing.iconPassed') : undefined,
      );
      item.command = {
        command: 'crosscheck.selectEnv',
        title: 'Select environment',
        arguments: [item],
      };
      return item;
    });
  }
}

export class EnvItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly fsPath: string,
    collapsibleState: vscode.TreeItemCollapsibleState,
  ) {
    super(label, collapsibleState);
    this.contextValue = 'crosscheckEnvItem';
  }
}
