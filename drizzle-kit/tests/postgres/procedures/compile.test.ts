import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { compileFile, compileSource } from 'src/dialects/postgres/procedures/compile';
import { decompileSql } from 'src/dialects/postgres/procedures/decompile';
import { formatDiagnostics } from 'src/dialects/postgres/procedures/diagnostics';
import { describe, expect, test } from 'vitest';
import { fixtureDirs, normalizeSql, readOrUpdateSnapshot } from './harness';

// Every fixtures/golden/<name>/input.ts compiles cleanly to expected.sql, byte for byte.
describe('golden', () => {
	for (const { name, dir, input } of fixtureDirs('golden')) {
		test(name, async () => {
			const result = await compileFile(input);
			if (result.diagnostics.length > 0) {
				throw new Error(`expected a clean compile:\n\n${formatDiagnostics(result.diagnostics, { relativeTo: dir })}`);
			}
			const actual = `${result.sql}\n`;
			const expected = readOrUpdateSnapshot(path.join(dir, 'expected.sql'), actual);
			if (expected !== null) expect(actual).toBe(expected);
		});
	}
});

// Every fixtures/errors/<name>/input.ts fails with exactly the diagnostics in expected.txt.
describe('errors', () => {
	for (const { name, dir, input } of fixtureDirs('errors')) {
		test(name, async () => {
			const result = await compileFile(input);
			expect(result.sql, 'expected the fixture to fail compilation').toBeNull();
			expect(result.diagnostics.length).toBeGreaterThan(0);
			const actual = `${formatDiagnostics(result.diagnostics, { relativeTo: dir })}\n`;
			const expected = readOrUpdateSnapshot(path.join(dir, 'expected.txt'), actual);
			if (expected !== null) expect(actual).toBe(expected);
		});
	}
});

// Every golden expected.sql decompiles to DSL source that compiles back to the same SQL.
describe('decompile roundtrip', () => {
	for (const { name, dir } of fixtureDirs('golden')) {
		test(name, async () => {
			const originalSql = readFileSync(path.join(dir, 'expected.sql'), 'utf8');
			const { ts, procedures } = decompileSql(originalSql);
			for (const p of procedures) {
				expect(p.verified, `IR re-emission diverged for '${p.ir.name}':\n${p.ts}`).toBe(true);
			}
			const recompiled = await compileSource(ts, path.join(dir, `__roundtrip__.ts`));
			if (recompiled.diagnostics.length > 0) {
				throw new Error(`decompiled DSL failed to recompile:\n\n${ts}\n\n${formatDiagnostics(recompiled.diagnostics)}`);
			}
			expect(normalizeSql(`${recompiled.sql}\n`)).toBe(normalizeSql(originalSql));
		});
	}
});
