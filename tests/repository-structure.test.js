import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

test('tracked source layout and active documentation links are valid', () => {
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  const processResult = spawnSync(process.execPath, ['scripts/verify-repository.mjs'], {
    cwd,
    encoding: 'utf8'
  });
  assert.equal(processResult.status, 0, processResult.stdout + '\n' + processResult.stderr);
  assert.match(processResult.stdout, /GABER_REPOSITORY_LAYOUT_OK/);
});
