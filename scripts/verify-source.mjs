import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const inventoryPath = resolve(root, 'docs/evidence/source-inventory.json');
const mode = process.argv[2] ?? '--check';
if (!['--check', '--write'].includes(mode)) {
  console.error('Usage: node scripts/verify-source.mjs [--check|--write]');
  process.exit(2);
}
const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean).filter((path) => path !== 'docs/evidence/source-inventory.json').sort();
const files = paths.map((path) => {
  const data = readFileSync(resolve(root, path));
  const sha = createHash('sha1').update(`blob ${data.length}\0`).update(data).digest('hex');
  return { path, sha };
});
const schemaVersion = 'gaber/source-inventory/1';
if (mode === '--write') {
  writeFileSync(inventoryPath, JSON.stringify({ schemaVersion, files }, null, 2) + '\n');
  console.log(`Updated source inventory: ${files.length} files`);
} else {
  const expected = JSON.parse(readFileSync(inventoryPath, 'utf8'));
  if (expected.schemaVersion !== schemaVersion || JSON.stringify(files) !== JSON.stringify(expected.files)) {
    const baseline = new Map((expected.files ?? []).map((f) => [f.path, f.sha]));
    const actual = new Map(files.map((f) => [f.path, f.sha]));
    const changed = [...new Set([...baseline.keys(), ...actual.keys()])].filter((path) => baseline.get(path) !== actual.get(path));
    console.error(`SOURCE_INVENTORY_MISMATCH: ${changed.slice(0, 20).join(', ')}${changed.length > 20 ? ' (+more)' : ''}`);
    process.exit(1);
  }
  console.log(`Source inventory OK: ${files.length} tracked files, Git blob SHA-1 verified`);
}
