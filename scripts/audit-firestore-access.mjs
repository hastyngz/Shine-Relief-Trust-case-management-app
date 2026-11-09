#!/usr/bin/env node
/**
 * Static inventory of Firestore access points before cache integration.
 *
 * Run with: node scripts/audit-firestore-access.mjs
 * This is an audit aid, not a security proof: review dynamic wrappers and aliases too.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join, relative, extname } from 'node:path';

const ROOTS = ['src', 'workers', 'server.ts'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage']);
const PATTERNS = [
  ['read:getDoc', /\bgetDoc\s*\(/g],
  ['read:getDocs', /\bgetDocs\s*\(/g],
  ['read:transaction.get', /\btransaction\.get\s*\(/g],
  ['live:onSnapshot', /\bonSnapshot\s*\(/g],
  ['write:setDoc', /\bsetDoc\s*\(/g],
  ['write:updateDoc', /\bupdateDoc\s*\(/g],
  ['write:deleteDoc', /\bdeleteDoc\s*\(/g],
  ['write:writeBatch', /\bwriteBatch\s*\(/g],
  ['write:runTransaction', /\brunTransaction\s*\(/g],
  ['server-admin:.get()', /\.get\s*\(\s*\)/g],
  ['server-admin:.onSnapshot()', /\.onSnapshot\s*\(/g],
];
const IMPORT_PATTERN = /from\s+['"](?:firebase\/firestore|@google-cloud\/firestore|firebase-admin\/firestore)['"]/;

async function collect(path, output) {
  let stat;
  try { stat = await (await import('node:fs/promises')).stat(path); } catch { return; }
  if (stat.isFile()) {
    if (EXTENSIONS.has(extname(path))) output.push(path);
    return;
  }
  if (!stat.isDirectory()) return;
  const entries = await readdir(path, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    await collect(join(path, entry.name), output);
  }
}

const files = [];
for (const root of ROOTS) await collect(root, files);
const findings = [];
for (const file of files) {
  const source = await readFile(file, 'utf8');
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const labels = [];
    for (const [label, pattern] of PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(line)) labels.push(label);
    }
    if (labels.length || IMPORT_PATTERN.test(line)) {
      findings.push({ file: relative(process.cwd(), file), line: i + 1, labels, text: line.trim().slice(0, 220) });
    }
  }
}
const counts = new Map();
for (const finding of findings) {
  for (const label of finding.labels) counts.set(label, (counts.get(label) || 0) + 1);
}
console.log('SHINE Firestore access inventory');
console.log('Static scan only; inspect false positives and indirect access wrappers.\n');
console.log('Counts by access pattern:');
for (const [label, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`  ${label}: ${count}`);
}
console.log(`\nFiles/lines with access patterns or Firestore imports (${findings.length}):`);
for (const finding of findings) {
  console.log(`${finding.file}:${finding.line} ${finding.labels.join(',') || 'Firestore import'} | ${finding.text}`);
}
console.log('\nBefore enabling KV caching, classify each read by data sensitivity, permissions, live-update needs, and every corresponding write/invalidation path.');
