import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, test, vi } from 'vitest';
import type { preparePullConfig } from '../src/cli/commands/utils';

const outputDirs: string[] = [];

vi.mock('../src/cli/utils', async (importOriginal) => {
	const actual = await importOriginal<typeof import('../src/cli/utils')>();
	return {
		...actual,
		assertOrmCoreVersion: vi.fn(),
		assertPackages: vi.fn(),
	};
});

vi.mock('../src/cli/commands/introspect', () => ({
	introspectPostgres: vi.fn(async () => {
		throw new Error('connect ECONNREFUSED 127.0.0.1:1');
	}),
}));

import { pull } from '../src/cli/schema';

afterEach(() => {
	for (const dir of outputDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
	vi.restoreAllMocks();
	process.exitCode = 0;
});

test('sets a failing process status when database introspection fails', async () => {
	const out = mkdtempSync(join(tmpdir(), 'drizzle-pull-error-'));
	outputDirs.push(out);
	const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
	process.exitCode = 0;

	const config: Awaited<ReturnType<typeof preparePullConfig>> = {
		dialect: 'postgresql',
		credentials: { url: 'postgresql://postgres:postgres@127.0.0.1:1/nonexistent' },
		out,
		breakpoints: true,
		casing: 'camel',
		tablesFilter: [],
		schemasFilter: [],
		prefix: 'index',
		entities: { roles: false },
	};

	await pull.handler!(config);

	expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ message: expect.stringContaining('ECONNREFUSED') }));
	expect(process.exitCode).toBe(1);
});
