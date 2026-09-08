import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

// Mock hanji's render. Any push/pull/generate path that reaches `render(new Select(...))` hits this
// mock; the SDK contract requires it is NEVER called. A no-op impl keeps a regression silent (the
// real renderer would pollute CI logs) while the call-count assertion still catches it.
vi.mock('hanji', async (importOriginal) => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		render: vi.fn(),
	};
});

import * as hanji from 'hanji';
import { generate, pull, push } from '../../src/cli-sdk';

let cleanups: Array<() => void> = [];

const stageTmpDir = (label: string) => {
	const dir = mkdtempSync(resolve(tmpdir(), `drizzle-kit-no-interactive-${label}-`));
	cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
	return dir;
};

const expectNoRender = () => expect(hanji.render).toHaveBeenCalledTimes(0);

describe('hanji render is never called from SDK paths', () => {
	let originalPrefix: string | undefined;

	beforeEach(() => {
		originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
		delete process.env.TEST_CONFIG_PATH_PREFIX;
		(hanji.render as ReturnType<typeof vi.fn>).mockClear();
		cleanups = [];
	});

	afterEach(() => {
		for (const fn of cleanups) fn();
		if (originalPrefix !== undefined) {
			process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
		}
	});

	test('push does not render when the schema file is missing', async () => {
		const result = await push({
			dialect: 'postgresql',
			schema: 'tests/definitely-missing-schema.ts',
			url: 'postgresql://invalid:invalid@127.0.0.1:1/none',
		});
		expect(result.status).toBe('error');
		expectNoRender();
	});

	test('pull does not render when the database is unreachable', async () => {
		const out = stageTmpDir('pull');
		const result = await pull({
			dialect: 'postgresql',
			url: 'postgresql://invalid:invalid@127.0.0.1:1/none',
			out,
		});
		expect(result.status).toBe('error');
		expectNoRender();
	});

	test('generate does not render on a no_changes run', async () => {
		// The empty-schema fixture lives at tests/cli/schema.ts; with the prefix the SDK resolves
		// './schema.ts' → 'tests/cli/schema.ts' and yields no_changes, short-circuiting before render.
		process.env.TEST_CONFIG_PATH_PREFIX = './tests/cli/';
		const out = stageTmpDir('generate');
		const result = await generate({ dialect: 'postgresql', schema: './schema.ts', out });
		expect(result.status).toBe('no_changes');
		expectNoRender();
	});
});
