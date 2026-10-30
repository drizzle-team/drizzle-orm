// Validates the file listing of a packed npm tarball for @drizzle-team/postgres.
// Runs under node against the tarball's actual bytes, not a second pack.
//   node scripts/pack-check.mjs <path-to-tgz>
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tgz = process.argv[2];
if (!tgz) {
	console.error('usage: node scripts/pack-check.mjs <tgz>');
	process.exit(2);
}

const entries = execFileSync('tar', ['-tzf', tgz], { encoding: 'utf8' })
	.split('\n')
	.filter(Boolean)
	.map((p) => p.replace(/^package\//, ''))
	.filter((p) => !p.endsWith('/'));

const ALLOW_ROOT = new Set(['package.json', 'LICENSE', 'README.md']);
const badRoot = entries.filter((p) => !p.startsWith('dist/') && !ALLOW_ROOT.has(p));
const maps = entries.filter((p) => p.endsWith('.map'));

const REQUIRED = ['package.json', 'LICENSE', 'README.md'];
const missing = REQUIRED.filter((r) => !entries.includes(r));
const hasDist = entries.some((p) => p.startsWith('dist/'));

// Each dist/X.js needs src/X.ts; each dist/X.d.ts needs src/X.ts or src/X.d.ts
// (dist/runtime.d.ts is an ambient declaration with no .js sibling, covered by the latter).
// dist/_virtual/ holds the bundler's own helpers (the namespace export of ./effect needs one).
const orphans = entries
	.filter((p) => p.startsWith('dist/') && !p.startsWith('dist/_virtual/') && (p.endsWith('.js') || p.endsWith('.d.ts')))
	.filter((p) => {
		if (p.endsWith('.d.ts')) {
			const base = p.replace(/^dist\//, 'src/');
			return !fs.existsSync(base.replace(/\.d\.ts$/, '.ts')) && !fs.existsSync(base);
		}
		return !fs.existsSync(p.replace(/^dist\//, 'src/').replace(/\.js$/, '.ts'));
	});

// Classes with private or protected members are not compatible between two copies of Drizzle Postgres.
const extracted = fs.mkdtempSync(path.join(os.tmpdir(), 'postgres-pack-check-'));
execFileSync('tar', ['-xzf', tgz, '-C', extracted]);
const privateMembers = entries.filter((p) => p.endsWith('.d.ts')).flatMap((p) =>
	fs.readFileSync(path.join(extracted, 'package', p), 'utf8').split('\n')
		.map((line, index) => ({ line, index }))
		.filter(({ line }) => /^\s*(?:private|protected)\s/.test(line))
		.map(({ line, index }) => `${p}:${index + 1}: ${line.trim()}`)
);
fs.rmSync(extracted, { recursive: true, force: true });

const problems = [
	...badRoot.map((p) => `unexpected root/path entry: ${p}`),
	...privateMembers.map((p) => `private or protected member in a published declaration: ${p}`),
	...maps.map((p) => `source map shipped: ${p}`),
	...orphans.map((p) => `orphaned dist file, no matching src: ${p}`),
	...missing.map((r) => `missing required entry: ${r}`),
	...(hasDist ? [] : ['tarball contains no dist/ files']),
];

if (problems.length > 0) {
	for (const p of problems) console.error(p);
	process.exit(1);
}
process.exit(0);
