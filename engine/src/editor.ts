import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Opens `text` in the user's editor and returns what they saved.
 * `header` lines are written as a leading JSON comment-free banner the editor shows and we strip.
 */
export function editInEditor(text: string, suffix = '.json', banner: string[] = []): string {
  const editor = process.env.VISUAL || process.env.EDITOR || 'vi';
  const dir = mkdtempSync(join(tmpdir(), 'parity-'));
  const file = join(dir, `draft${suffix}`);
  const head = banner.length ? banner.map((l) => `// ${l}`).join('\n') + '\n' : '';
  writeFileSync(file, head + text, 'utf8');
  const [cmd, ...args] = editor.split(' ');
  const result = spawnSync(cmd, [...args, file], { stdio: 'inherit' });
  if (result.error) throw result.error;
  const saved = readFileSync(file, 'utf8');
  rmSync(dir, { recursive: true, force: true });
  return saved
    .split('\n')
    .filter((l) => !l.startsWith('// '))
    .join('\n');
}

export function hasEditor(): boolean {
  return Boolean(process.env.VISUAL || process.env.EDITOR) && Boolean(process.stdin.isTTY);
}
