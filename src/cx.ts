import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

// Minimum cx version the extension requires.
const MIN_VERSION: [number, number, number] = [0, 1, 0];

let outputChannel: vscode.OutputChannel | undefined;

export function getOutputChannel(): vscode.OutputChannel {
  if (!outputChannel) {
    outputChannel = vscode.window.createOutputChannel('crosscheck');
  }
  return outputChannel;
}

export function resolveCx(): string {
  const config = vscode.workspace.getConfiguration('crosscheck');
  const configPath = config.get<string>('executablePath', '').trim();
  if (configPath) return configPath;

  const fromPath = which('cx');
  if (fromPath) return fromPath;

  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const candidates = [
    path.join(home, '.local', 'bin', 'cx'),
    '/usr/local/bin/cx',
    '/usr/bin/cx',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }

  return 'cx';
}

function which(cmd: string): string | undefined {
  try {
    const out = child_process.execSync(
      process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`,
      { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] },
    );
    return out.trim().split('\n')[0];
  } catch {
    return undefined;
  }
}

export function checkVersion(): void {
  const cx = resolveCx();
  child_process.exec(`"${cx}" --version`, (_err, stdout, stderr) => {
    if (_err) {
      vscode.window
        .showWarningMessage(
          'crosscheck: cx binary not found. Install it to use run/validate features.',
          'Open docs',
        )
        .then((choice) => {
          if (choice === 'Open docs') {
            vscode.env.openExternal(
              vscode.Uri.parse('https://github.com/lozymon/crosscheck'),
            );
          }
        });
      return;
    }

    const output = stdout || stderr;
    const match = output.match(/(\d+)\.(\d+)\.(\d+)/);
    if (!match) return;

    const [maj, min, patch] = [+match[1], +match[2], +match[3]];
    const [minMaj, minMin, minPatch] = MIN_VERSION;

    const tooOld =
      maj < minMaj ||
      (maj === minMaj && min < minMin) ||
      (maj === minMaj && min === minMin && patch < minPatch);

    if (tooOld) {
      vscode.window.showWarningMessage(
        `crosscheck: cx ${maj}.${min}.${patch} is below minimum supported version ${MIN_VERSION.join('.')}. Please upgrade.`,
      );
    }
  });
}

export function buildArgs(file: string | undefined, extra: string[]): string[] {
  const config = vscode.workspace.getConfiguration('crosscheck');
  const envFile = config.get<string>('defaultEnvFile', '.env');
  const insecure = config.get<boolean>('insecure', false);

  const args: string[] = file ? ['run', file] : ['run'];
  args.push('--env-file', envFile);
  if (insecure) args.push('--insecure');
  args.push(...extra);
  return args;
}

export function spawnCx(
  args: string[],
  cwd?: string,
): child_process.ChildProcess {
  const cx = resolveCx();
  const channel = getOutputChannel();
  channel.show(true);
  channel.appendLine(`\n> cx ${args.join(' ')}\n`);

  const workspaceCwd =
    cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();

  const proc = child_process.spawn(cx, args, { cwd: workspaceCwd });
  proc.stdout?.on('data', (d: Buffer) => channel.append(d.toString()));
  proc.stderr?.on('data', (d: Buffer) => channel.append(d.toString()));
  proc.on('close', (code) =>
    channel.appendLine(`\n[exited with code ${code}]`),
  );

  return proc;
}
