import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

// ---------------------------------------------------------------------------
// Task 4 regression guard: heavy views and document libraries must stay out of
// the first download. These are source-level checks so they run without a build.
// ---------------------------------------------------------------------------
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath: string) => readFileSync(join(root, relativePath), 'utf8');

const appSource = read('src/App.tsx');

// 1. Every heavy view is loaded through React.lazy, not a static import.
const lazyViews: Array<[string, string]> = [
  ['./components/ManagementDashboard', 'ManagementDashboard'],
  ['./components/Reports', 'Reports'],
  ['./components/Reports/ReportBuilder', 'ReportBuilder'],
  ['./components/AIAssistant/AIAssistantView', 'AIAssistantView'],
  ['./components/Messaging/MessagingView', 'MessagingView'],
  ['./components/Planning/BudgetsAndWorkplansView', 'BudgetsAndWorkplansView'],
  ['./components/PayrollDashboard', 'PayrollDashboard'],
  ['./components/CaseManagementView', 'CaseManagementView'],
  ['./components/Import/DataImportWizard', 'DataImportWizard'],
  ['./components/Contacts/ContactsView', 'ContactsView'],
  ['./components/Intelligence/Phase5OperationsView', 'Phase5OperationsView'],
  ['./components/Programmes/ProgrammesView', 'ProgrammesView'],
  ['./components/StaffManagement', 'StaffManagement'],
];

for (const [path, name] of lazyViews) {
  const lazyPattern = new RegExp(`lazy\\(\\s*\\(\\)\\s*=>\\s*import\\('${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\)`);
  assert.ok(lazyPattern.test(appSource), `${name} should be loaded with React.lazy from ${path}`);
  const staticPattern = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*'${path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'`);
  assert.ok(!staticPattern.test(appSource), `${name} must not be a static import in App.tsx`);
}

// The dashboard and navigation stay eager so the first paint is immediate.
assert.ok(/import\s*\{\s*Dashboard\s*\}\s*from\s*'\.\/components\/Dashboard'/.test(appSource), 'Dashboard stays eagerly imported');
assert.ok(/import\s*\{\s*Navigation/.test(appSource), 'Navigation stays eagerly imported');
assert.ok(appSource.includes('<Suspense'), 'App renders a Suspense boundary for the lazy views');

// 2. Document libraries are only ever loaded with dynamic import().
const heavyLibs = ['xlsx', 'docx', 'jspdf', 'jspdf-autotable', 'mammoth', 'jszip'];
const staticHeavyImport = new RegExp(`^\\s*import\\s+(?!type\\b)[^;]*from\\s+['"](${heavyLibs.join('|')})['"]`, 'm');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

for (const file of walk(join(root, 'src'))) {
  const source = readFileSync(file, 'utf8');
  const match = source.match(staticHeavyImport);
  assert.ok(!match, `${file} must use dynamic import() for ${match?.[1]}, not a static import`);
}

// At least one dynamic import exists per heavy library that the app ships.
for (const lib of ['xlsx', 'docx', 'jspdf', 'mammoth', 'jszip']) {
  const dynamicPattern = new RegExp(`import\\(['"]${lib}['"]\\)`);
  const usedSomewhere = walk(join(root, 'src')).some((file) => dynamicPattern.test(readFileSync(file, 'utf8')));
  assert.ok(usedSomewhere, `${lib} should be loaded with dynamic import() somewhere in src`);
}

// 3. Vite splits vendor code into separate chunks.
const viteConfig = read('vite.config.ts');
assert.ok(/advancedChunks|manualChunks/.test(viteConfig), 'vite.config.ts configures vendor chunk splitting');
assert.ok(/vendor-react/.test(viteConfig), 'react vendor chunk is configured');
assert.ok(/vendor-firebase/.test(viteConfig), 'firebase vendor chunk is configured');
assert.ok(/vendor-documents/.test(viteConfig), 'document libraries get their own chunk group');

// 4. If a build is present, the entry HTML must not pull the document chunk.
const distDir = join(root, 'dist');
const indexPath = join(distDir, 'index.html');
if (existsSync(indexPath)) {
  const html = readFileSync(indexPath, 'utf8');
  const entryAssets = [...html.matchAll(/(?:src|href)="\/assets\/([^"]+)"/g)].map((match) => match[1]);
  const entrySource = entryAssets
    .filter((name) => name.endsWith('.js'))
    .map((name) => readFileSync(join(distDir, 'assets', name), 'utf8'))
    .join('\n');
  for (const lib of ['vendor-documents', 'xlsx-', 'jszip.min', 'jspdf.es.min']) {
    assert.ok(!entryAssets.some((name) => name.startsWith(lib)), `the first load must not include ${lib}`);
    assert.ok(!entrySource.includes(`./${lib}`), `the entry must not statically import ${lib}`);
  }
}

console.log('Code splitting tests passed: heavy views are lazy and document libraries are dynamically imported.');
