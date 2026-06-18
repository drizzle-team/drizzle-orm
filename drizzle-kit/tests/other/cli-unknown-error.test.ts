import { stripVTControlCharacters } from 'node:util';
import { unknownError } from 'src/cli/views';
import { expect, test } from 'vitest';

// Regression: the CLI's `unknown_error` theme handler used to print only
// `e.message`, discarding the stack trace. A schema file that throws during
// load (generate / migrate / push) then gave no file:line to debug.

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
});

test('unknownError does not loop on a self-referential cause chain', () => {
	const e: Error & { cause?: unknown } = new Error('self ref');
	e.cause = e;

	const out = stripVTControlCharacters(unknownError(e));
	expect(out).toContain('self ref');
});
