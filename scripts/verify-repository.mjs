import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const paths = execFileSync('git', ['ls-files', '-z'], { cwd: root, encoding: 'utf8' })
  .split('\0').filter(Boolean);
const tracked = new Set(paths);
const errors = [];
const required = [
  '.editorconfig',
  '.github/workflows/ci.yml',
  '.github/pull_request_template.md',
  '.nvmrc',
  'README.md',
  'CONTRIBUTING.md',
  'package.json',
  'package-lock.json',
  'docs/INDEX.md',
  'docs/STATUS.md',
  'docs/PROJECT-STRUCTURE.md',
  'docs/THREE-ROLE-PLATFORM-CONTRACT.md',
  'docs/RELEASE-REVIEW-GATES.md',
  'docs/evidence/source-inventory.json',
  'scripts/verify-source.mjs',
  'scripts/verify-repository.mjs',
  'server/accessPolicy.js',
  'server/orderCommandAdmission.js',
  'server/orderHttpApi.js',
  'server/postgresOrderRepository.js',
  'server/migrations/007_verified_factory_directory_hold.sql',
  'src/App.jsx',
  'src/domain.js',
  'src/Scene.jsx',
  'src/partnerEconomics.js',
  'tests/role-interactions-e2e.test.js',
  'tests/order-intake-e2e.test.js'
];
const forbidden = [
  /(^|\/)(node_modules|dist|coverage|\.next)(\/|$)/,
  /^\.env(\.|$)/,
  /\.log$/,
  /(^|\/)\.DS_Store$/
];

for (const path of required) {
  if (!tracked.has(path)) errors.push('REQUIRED_FILE_NOT_TRACKED: ' + path);
}
const seen = new Map();
for (const path of paths) {
  if (path.startsWith('/') || path.includes('\\') || path.split('/').some((part) => part === '.' || part === '..' || part === '')) {
    errors.push('INVALID_PATH: ' + path);
  }
  const folded = path.toLowerCase();
  if (seen.has(folded) && seen.get(folded) !== path) {
    errors.push('CASE_COLLISION: ' + seen.get(folded) + ' / ' + path);
  }
  seen.set(folded, path);
  if (forbidden.some((pattern) => pattern.test(path))) errors.push('GENERATED_OR_SECRET_PATH: ' + path);
  const absolute = resolve(root, path);
  if (!existsSync(absolute) || !statSync(absolute).isFile()) errors.push('MISSING_TRACKED_FILE: ' + path);
}

// Current documentation is verified; historical audit documents are intentionally
// excluded because their obsolete links and roles are archived evidence.
const currentDocs = [
  'README.md',
  'CONTRIBUTING.md',
  'docs/INDEX.md',
  'docs/STATUS.md',
  'docs/PROJECT-STRUCTURE.md',
  '.github/pull_request_template.md'
];
for (const doc of currentDocs) {
  if (!existsSync(resolve(root, doc))) continue;
  const markdown = readFileSync(resolve(root, doc), 'utf8');
  const links = /!?\[[^\]]*\]\(([^)]+)\)/g;
  for (const match of markdown.matchAll(links)) {
    const raw = match[1].trim().split(/\s+["']/)[0].replace(/^<|>$/g, '');
    if (!raw || raw.startsWith('#') || /^[a-z][a-z\d+.-]*:\/\//i.test(raw) || raw.startsWith('mailto:')) continue;
    const pathname = raw.split('#')[0].split('?')[0];
    let decoded;
    try { decoded = decodeURIComponent(pathname); }
    catch { errors.push('INVALID_MARKDOWN_URL: ' + doc + ' => ' + raw); continue; }
    if (!decoded) continue;
    const destination = posix.normalize(posix.join(posix.dirname(doc), decoded));
    if (!tracked.has(destination)) errors.push('BROKEN_LOCAL_LINK: ' + doc + ' => ' + raw);
  }
}
if (errors.length) {
  for (const error of errors) console.error(error);
  console.error('GABER_REPOSITORY_LAYOUT_FAILED count=' + errors.length);
  process.exit(1);
}
console.log('GABER_REPOSITORY_LAYOUT_OK tracked_files=' + paths.length + ' checked_docs=' + currentDocs.length);
