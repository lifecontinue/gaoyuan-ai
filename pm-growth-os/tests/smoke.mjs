import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createInitialWorkspace } from '../server/lib/domain.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const checks = [
  ['initial workspace starts empty', checkInitialWorkspace],
  ['no legacy mock-data references', checkNoMockDataReferences],
  ['src has no CJK or mojibake copy', checkNoCjkOrMojibakeInSrc],
];

let failed = false;

for (const [label, check] of checks) {
  try {
    await check();
    console.log(`ok - ${label}`);
  } catch (error) {
    failed = true;
    console.error(`not ok - ${label}`);
    console.error(error instanceof Error ? error.message : String(error));
  }
}

if (failed) {
  process.exitCode = 1;
}

function checkInitialWorkspace() {
  const workspace = createInitialWorkspace();

  assert(workspace.captureDraft === '', 'Expected empty captureDraft.');
  assert(workspace.notes.length === 0, 'Expected no initial notes.');
  assert(workspace.usageLogs.length === 0, 'Expected no initial usage logs.');
  assert(
    workspace.capabilities.every((capability) => capability.progress === 0),
    'Expected all initial capabilities to start at 0 progress.',
  );
}

function checkNoMockDataReferences() {
  const files = listFiles(['src', 'server', 'api'], /\.(ts|tsx|mjs|js)$/);
  const offenders = files.filter((filePath) => {
    const content = fs.readFileSync(filePath, 'utf8');
    return content.includes('mock-data');
  });

  assert(offenders.length === 0, `Found legacy mock-data references:\n${formatFiles(offenders)}`);
}

function checkNoCjkOrMojibakeInSrc() {
  const files = listFiles(['src'], /\.(ts|tsx|css)$/);
  const forbidden = /[\u4e00-\u9fff]|\u9382|\u9473|\u7481|\u7eef|\u935b|\u93c9|\u6d93|\u701b|\u934f|\u93c2|\u8930|\u9241|\u920f/u;
  const offenders = files.filter((filePath) => forbidden.test(fs.readFileSync(filePath, 'utf8')));

  assert(offenders.length === 0, `Found CJK or mojibake characters in src:\n${formatFiles(offenders)}`);
}

function listFiles(relativeDirs, pattern) {
  return relativeDirs.flatMap((relativeDir) => walk(path.join(repoRoot, relativeDir), pattern));
}

function walk(directory, pattern) {
  if (!fs.existsSync(directory)) return [];

  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(fullPath, pattern));
      continue;
    }

    if (pattern.test(fullPath)) {
      files.push(fullPath);
    }
  }

  return files;
}

function formatFiles(files) {
  return files.map((filePath) => path.relative(repoRoot, filePath)).join('\n');
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}
