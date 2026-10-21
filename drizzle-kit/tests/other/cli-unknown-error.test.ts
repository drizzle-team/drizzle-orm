import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stripVTControlCharacters } from 'node:util';
import { unknownError } from 'src/cli/views';
import { expect, test } from 'vitest';

test('unknownError keeps the message header', () => {
	const out = stripVTControlCharacters(unknownError(new Error('boom')));
	expect(out).toContain('Error');
	expect(out).toContain('boom');
});

test('unknownError surfaces the stack trace', () => {
	const e = new Error("Cannot read properties of undefined (reading 'kind')");
	const out = stripVTControlCharacters(unknownError(e));

	// The stack must be present, not just the message line.
	expect(out).toContain(e.stack!);
	// This file appears in the stack frames, proving file:line is recoverable.
	expect(out).toContain('cli-unknown-error.test.ts');
});

test('unknownError walks the cause chain', () => {
	const root = new Error('half-initialized table from circular import');
	const wrapped = new Error('schema load failed', { cause: root });

	const out = stripVTControlCharacters(unknownError(wrapped));

	expect(out).toContain('schema load failed');
	expect(out).toContain('Caused by:');
	expect(out).toContain('half-initialized table from circular import');
});

test('unknownError handles non-Error throwables without crashing', () => {
	const out = stripVTControlCharacters(unknownError('plain string failure'));
	expect(out).toContain('plain string failure');
	expect(out).not.toContain('Caused by:');
});

test('unknownError does not loop on a self-referential cause chain', () => {
	const e: Error & { cause?: unknown } = new Error('self ref');
	e.cause = e;

	const out = stripVTControlCharacters(unknownError(e));
	expect(out).toContain('self ref');
});

test('generate keeps the schema location and cause without changing json output', () => {
	const directory = mkdtempSync(join(tmpdir(), 'drizzle-unknown-error-'));
	const schema = join(directory, 'broken-schema.ts');
	writeFileSync(schema, "throw new Error('schema load failed', { cause: new Error('inner schema failure') });\n");

	const run = (output: 'text' | 'json') => {
		const argv = [
			'node',
			'drizzle-kit',
			'generate',
			`--output=${output}`,
			'--dialect=postgresql',
			`--schema=${schema}`,
			`--out=${join(directory, 'migrations')}`,
		];
		const script = `process.argv = ${JSON.stringify(argv)}; import('./src/cli/index.ts');`;
		return spawnSync('pnpm', ['exec', 'tsx', '-e', script], { encoding: 'utf8' });
	};

	try {
		const text = run('text');
		expect(text.status).toBe(1);
		expect(text.stdout).toBe('');
		expect(text.stderr).toContain('broken-schema.ts:1:');
		expect(text.stderr).toContain('Caused by: Error: inner schema failure');

		const json = run('json');
		expect(json.status).toBe(1);
		expect(JSON.parse(json.stdout)).toEqual({
			status: 'error',
			error: { code: 'unknown_error', message: 'schema load failed' },
		});
		expect(json.stderr.trim()).toBe('schema load failed');
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
