import * as fs from 'fs';

export interface TestEntry {
  name: string;
  line: number; // 0-based
}

export interface ParseResult {
  tests: TestEntry[];
  error?: string;
}

// Matches lines like:
//   - name: my test
//   - name: "quoted test"
//   - name: 'single quoted'
const NAME_PATTERN = /^(\s*)-\s+name:\s*["']?(.+?)["']?\s*$/;

export function parseContent(content: string): ParseResult {
  const lines = content.split('\n');
  const tests: TestEntry[] = [];

  for (let i = 0; i < lines.length; i++) {
    const m = NAME_PATTERN.exec(lines[i]);
    if (m) {
      tests.push({ name: m[2].trim(), line: i });
    }
  }

  return { tests };
}

export function parseFile(filePath: string): ParseResult {
  let content: string;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    return { tests: [], error: String(err) };
  }
  return parseContent(content);
}
