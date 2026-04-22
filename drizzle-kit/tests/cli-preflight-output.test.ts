import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';

vi.mock('../src/cli/utils', async () => {
	const actual = await vi.importActual<typeof import('../src/cli/utils')>(
		'../src/cli/utils',
	);
	return {
		...actual,
		assertOrmCoreVersion: vi.fn(async () => {}),
		assertPackages: vi.fn(async () => {}),
	};
});

vi.mock('../src/cli/commands/migrate', () => ({
	prepareAndMigratePg: vi.fn(async () => ({
		version: 1,
		questions: [
			{
				id: 'table:public.accounts',
				kind: 'table',
				to: { name: 'accounts', schema: 'public' },
				choices: [
					{ type: 'create' },
					{ type: 'rename', from: { name: 'users', schema: 'public' } },
				],
			},
		],
	})),
	prepareAndMigrateMysql: vi.fn(async () => ({
		version: 1,
		questions: [],
	})),
	prepareAndMigrateSqlite: vi.fn(async () => ({
		version: 1,
		questions: [],
	})),
	prepareAndMigrateLibSQL: vi.fn(async () => ({
		version: 1,
		questions: [],
	})),
	prepareAndMigrateSingleStore: vi.fn(async () => ({
		version: 1,
		questions: [],
	})),
}));

const tmpRoots: string[] = [];
const packageRoot = join(__dirname, '..');

const writeMysqlSchema = (dir: string) => {
	writeFileSync(
		join(dir, 'schema.ts'),
		[
			"import { int, mysqlTable } from 'drizzle-orm/mysql-core';",
			'',
			"export const users = mysqlTable('users', {",
			"\tid: int('id').primaryKey(),",
			'});',
			'',
		].join('\n'),
	);
};

const writeConfig = (dir: string) => {
	writeFileSync(
		join(dir, 'drizzle.config.js'),
		[
			'module.exports = {',
			"\tdialect: 'mysql',",
			`\tschema: ${JSON.stringify(join(dir, 'schema.ts'))},`,
			`\tout: ${JSON.stringify(join(dir, 'drizzle'))},`,
			'};',
			'',
		].join('\n'),
	);
};

afterEach(() => {
	for (const dir of tmpRoots.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
});

beforeEach(() => {
	vi.restoreAllMocks();
});

test('preflight uses stderr for info logs and stdout for JSON payload', async () => {
	const dir = mkdtempSync(join(packageRoot, 'tests/.tmp-preflight-'));
	tmpRoots.push(dir);
	writeMysqlSchema(dir);
	writeConfig(dir);

	const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
	const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

	const { prepareGenerateConfig } = await import('../src/cli/commands/utils');
	const { serializeMySql } = await import('../src/serializer');
	const schemaModule = await import('../src/cli/schema');
	const { withMachineOutput } = await import('../src/cli/output');

	await prepareGenerateConfig(
		{ config: join(dir, 'drizzle.config.js'), preflight: true },
		'config',
	);
	expect(logSpy).not.toHaveBeenCalledWith(
		expect.stringContaining('Reading config file'),
	);
	expect(errorSpy).toHaveBeenCalledWith(
		expect.stringContaining('Reading config file'),
	);

	logSpy.mockClear();
	errorSpy.mockClear();

	await withMachineOutput(true, async () => {
		await serializeMySql(join(dir, 'schema.ts'), undefined);
	});
	expect(logSpy).not.toHaveBeenCalledWith(
		expect.stringContaining('Reading schema files'),
	);
	expect(errorSpy).toHaveBeenCalledWith(
		expect.stringContaining('Reading schema files'),
	);

	logSpy.mockClear();
	errorSpy.mockClear();

	const { generate } = schemaModule as any;
	await generate.handler({
		dialect: 'postgresql',
		name: undefined,
		custom: false,
		prefix: 'index',
		breakpoints: true,
		schema: join(dir, 'schema.ts'),
		out: join(dir, 'drizzle'),
		bundle: false,
		casing: undefined,
		driver: undefined,
		preflight: true,
		answers: undefined,
	});

	expect(errorSpy).not.toHaveBeenCalled();
	expect(logSpy).toHaveBeenCalledWith(
		JSON.stringify(
			{
				version: 1,
				questions: [
					{
						id: 'table:public.accounts',
						kind: 'table',
						to: { name: 'accounts', schema: 'public' },
						choices: [
							{ type: 'create' },
							{ type: 'rename', from: { name: 'users', schema: 'public' } },
						],
					},
				],
			},
			null,
			2,
		),
	);
});
