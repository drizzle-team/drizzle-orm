#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageDir = join(scriptDir, '..', 'packages', 'drizzle-pulse');
const manifestPath = join(packageDir, 'package.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));

const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
  cwd: packageDir,
  encoding: 'utf8',
});

if (result.status !== 0) {
  console.error('pack-check: npm pack --dry-run failed');
  console.error(result.stderr);
  process.exit(1);
}

// npm 11 and earlier emit an array of pack results; npm 12 emits an object keyed by package
// name. Accept either so the gate does not silently depend on the local npm major.
const parsed = JSON.parse(result.stdout);
const [packResult] = Array.isArray(parsed) ? parsed : Object.values(parsed);
const packedPaths = packResult.files.map((file) => file.path);

const errors = [];

const allowedPrefixes = ['dist/'];
const allowedExact = new Set(['package.json', 'LICENSE', 'README.md']);
const disallowedPaths = packedPaths.filter(
  (path) => !allowedExact.has(path) && !allowedPrefixes.some((prefix) => path.startsWith(prefix)),
);
if (disallowedPaths.length > 0) {
  errors.push(`Packed paths outside the allowlist: ${disallowedPaths.join(', ')}`);
}

const mapPaths = packedPaths.filter((path) => path.endsWith('.map'));
if (mapPaths.length > 0) {
  errors.push(`Packed .map files: ${mapPaths.join(', ')}`);
}

const packedSet = new Set(packedPaths);

const requiredExact = ['package.json', 'LICENSE', 'README.md'];
const missingRequired = requiredExact.filter((path) => !packedSet.has(path));
if (missingRequired.length > 0) {
  errors.push(`Required files missing from the packed tarball: ${missingRequired.join(', ')}`);
}

const missingEntrypointFiles = [];
for (const target of Object.values(manifest.exports ?? {})) {
  if (typeof target !== 'object' || target === null) continue;
  for (const key of ['types', 'default']) {
    const value = target[key];
    if (typeof value !== 'string') continue;
    const stripped = value.startsWith('./') ? value.slice(2) : value;
    if (!packedSet.has(stripped)) {
      missingEntrypointFiles.push(stripped);
    }
  }
}
if (missingEntrypointFiles.length > 0) {
  errors.push(
    `Exports map targets missing from the packed tarball: ${missingEntrypointFiles.join(', ')}`,
  );
}

// devDependencies never install for consumers and bun resolves catalog: at publish time,
// so devDependencies.drizzle-orm=catalog: is a false positive for the shipped artifact.
const depFields = ['dependencies', 'peerDependencies', 'optionalDependencies'];
const catalogOrWorkspaceLeaks = [];
for (const field of depFields) {
  const deps = manifest[field];
  if (!deps) continue;
  for (const [name, range] of Object.entries(deps)) {
    if (
      typeof range === 'string' &&
      (range.startsWith('catalog:') || range.startsWith('workspace:'))
    ) {
      catalogOrWorkspaceLeaks.push(`${field}.${name}=${range}`);
    }
  }
}
if (catalogOrWorkspaceLeaks.length > 0) {
  errors.push(`catalog:/workspace: leaks in manifest: ${catalogOrWorkspaceLeaks.join(', ')}`);
}

// Catches stale compiled output from since-deleted src files (a bare `tsc` prepack
// doesn't clean dist/, so deleted modules can keep shipping).
const orphanedDistFiles = [];
for (const path of packedPaths) {
  if (!path.startsWith('dist/') || !path.endsWith('.js')) continue;
  const srcPath = join(packageDir, `src/${path.slice('dist/'.length, -'.js'.length)}.ts`);
  if (!existsSync(srcPath)) {
    orphanedDistFiles.push(path);
  }
}
if (orphanedDistFiles.length > 0) {
  errors.push(`Packed dist files with no corresponding src file: ${orphanedDistFiles.join(', ')}`);
}

if (errors.length > 0) {
  console.error('pack-check: FAILED');
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log('pack-check: PASSED');
console.log(`Packed file list (${packedPaths.length} entries):`);
for (const path of packedPaths) {
  console.log(`  ${path}`);
}
