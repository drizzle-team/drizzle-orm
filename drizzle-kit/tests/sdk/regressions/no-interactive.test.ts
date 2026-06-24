import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock hanji's render function. Any push handler invocation that reaches `render(new Select(...))`
// hits this mock; the SDK contract requires the mock NEVER to be called. Use a no-op impl so a
// regression that does invoke render is captured by the call count assertion AND remains silent
// (the original `vi.fn(actual.render)` would have executed the real renderer and polluted CI logs).
vi.mock('hanji', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		render: vi.fn(),
	};
});

import * as hanji from 'hanji';
import { pull, push } from '../../../src/sdk';
import { generate } from '../../../src/sdk';

describe('hanji render is never called from SDK push path', () => {
	let originalPrefix: string | undefined;

	beforeEach(() => {
		originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
		delete process.env.TEST_CONFIG_PATH_PREFIX;
		(hanji.render as ReturnType<typeof vi.fn>).mockClear();
	});

	afterEach(() => {
		if (originalPrefix !== undefined) {
			process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
		}
	});

	test('push (missing-schema error smoke) does not call hanji.render', async () => {
		const result = await push({
			dialect: 'postgresql',
			schema: 'tests/definitely-missing-schema.ts',
			url: 'postgresql://invalid:invalid@127.0.0.1:1/none',
		});

		expect(result.status).toBe('error');
		expect(hanji.render).toHaveBeenCalledTimes(0);
	});
});

describe('hanji render is never called from SDK pull path', () => {
	let originalPrefix: string | undefined;

	beforeEach(() => {
		originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
		delete process.env.TEST_CONFIG_PATH_PREFIX;
		(hanji.render as ReturnType<typeof vi.fn>).mockClear();
	});

	afterEach(() => {
		if (originalPrefix !== undefined) {
			process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
		}
	});

	test('pull (unreachable-DB error smoke) does not call hanji.render', async () => {
		const tmpDir = mkdtempSync(resolve(tmpdir(), 'drizzle-kit-no-interactive-pull-'));
		try {
			const result = await pull({
				dialect: 'postgresql',
				url: 'postgresql://invalid:invalid@127.0.0.1:1/none',
				out: tmpDir,
			});

			expect(result.status).toBe('error');
			expect(hanji.render).toHaveBeenCalledTimes(0);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});

describe('hanji render is never called from SDK generate path', () => {
	let originalPrefix: string | undefined;

	beforeEach(() => {
		originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
		delete process.env.TEST_CONFIG_PATH_PREFIX;
		(hanji.render as ReturnType<typeof vi.fn>).mockClear();
	});

	afterEach(() => {
		if (originalPrefix !== undefined) {
			process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
		}
	});

	test('generate (no_changes smoke) does not call hanji.render', async () => {
		// The empty-schema fixture lives at tests/cli/schema.ts. With this prefix the SDK's
		// schema resolver maps './schema.ts' → 'tests/cli/schema.ts' and yields no_changes
		// directly, short-circuiting before any hanji render could fire.
		process.env.TEST_CONFIG_PATH_PREFIX = './tests/cli/';
		const tmpDir = mkdtempSync(resolve(tmpdir(), 'drizzle-kit-no-interactive-generate-'));
		try {
			const result = await generate({
				dialect: 'postgresql',
				schema: './schema.ts',
				out: tmpDir,
			});

			expect(result.status).toBe('no_changes');
			expect(hanji.render).toHaveBeenCalledTimes(0);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
