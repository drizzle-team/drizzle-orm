import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { handle as generateCockroach } from 'src/cli/commands/generate-cockroach';
import * as downHelpers from 'src/cli/commands/generate-down-helpers';
import { handle as generateMssql } from 'src/cli/commands/generate-mssql';
import { handle as generateMysql } from 'src/cli/commands/generate-mysql';
import { handle as generatePostgres } from 'src/cli/commands/generate-postgres';
import { handle as generateSinglestore } from 'src/cli/commands/generate-singlestore';
import { handle as generateSqlite } from 'src/cli/commands/generate-sqlite';
import type { GenerateConfig } from 'src/cli/commands/utils';
import { runWithCliContext } from 'src/cli/context';
import { HintsHandler } from 'src/cli/hints';
import { SchemaSource as PostgresSchemaSource } from 'src/dialects/postgres/drizzle';
import { SchemaSource as SqliteSchemaSource } from 'src/dialects/sqlite/drizzle';
import { afterAll, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('src/cli/commands/generate-down-helpers', async (importOriginal) => {
	const actual = await importOriginal<typeof import('src/cli/commands/generate-down-helpers')>();
	return { ...actual, computeDown: vi.fn(actual.computeDown) };
});

const computeDown = vi.mocked(downHelpers.computeDown);
const actualHelpers = await vi.importActual<typeof downHelpers>('src/cli/commands/generate-down-helpers');

const dialects = {
	postgresql: `import { integer, pgTable } from 'drizzle-orm/pg-core';
export const users = pgTable('users', { id: integer() });
`,
	sqlite: `import { integer, sqliteTable } from 'drizzle-orm/sqlite-core';
export const users = sqliteTable('users', { id: integer() });
`,
	mysql: `import { int, mysqlTable } from 'drizzle-orm/mysql-core';
export const users = mysqlTable('users', { id: int() });
`,
	singlestore: `import { int, singlestoreTable } from 'drizzle-orm/singlestore-core';
export const users = singlestoreTable('users', { id: int() });
`,
	cockroach: `import { cockroachTable, int4 } from 'drizzle-orm/cockroach-core';
export const users = cockroachTable('users', { id: int4() });
`,
	mssql: `import { int, mssqlTable } from 'drizzle-orm/mssql-core';
export const users = mssqlTable('users', { id: int() });
`,
};

type Dialect = keyof typeof dialects;

// Schema files must live inside the package so their drizzle-orm imports resolve.
const tmpRoot = resolve('tests/other/tmp');
mkdirSync(tmpRoot, { recursive: true });
const dirs: string[] = [];

afterAll(() => {
	for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
	computeDown.mockClear();
});

const generate = async (
	dialect: Dialect,
	options: Partial<Pick<GenerateConfig, 'breakpoints' | 'generateDownMigrations' | 'explain'>> = {},
	output: 'json' | 'text' = 'json',
) => {
	const dir = mkdtempSync(join(tmpRoot, `down-${dialect}-`));
	dirs.push(dir);
	const schemaPath = join(dir, 'schema.ts');
	writeFileSync(schemaPath, dialects[dialect]);
	const out = join(dir, 'drizzle');
	const base = {
		dialect,
		filenames: [schemaPath],
		out,
		breakpoints: true,
		generateDownMigrations: true,
		name: 'init',
		custom: false,
		bundle: false,
		explain: false,
		hints: new HintsHandler(),
		...options,
	} satisfies Omit<GenerateConfig, 'schemaSource'>;

	const result = await runWithCliContext({ output, interactive: false }, () => {
		switch (dialect) {
			case 'postgresql':
				return generatePostgres({ ...base, schemaSource: PostgresSchemaSource.fromFilenames(base.filenames) });
			case 'sqlite':
				return generateSqlite({ ...base, schemaSource: SqliteSchemaSource.fromFilenames(base.filenames) });
			case 'mysql':
				return generateMysql({ ...base, schemaSource: PostgresSchemaSource.fromFilenames(base.filenames) });
			case 'singlestore':
				return generateSinglestore({ ...base, schemaSource: PostgresSchemaSource.fromFilenames(base.filenames) });
			case 'cockroach':
				return generateCockroach({ ...base, schemaSource: PostgresSchemaSource.fromFilenames(base.filenames) });
			case 'mssql':
				return generateMssql({ ...base, schemaSource: PostgresSchemaSource.fromFilenames(base.filenames) });
		}
	});

	const tags = existsSync(out) ? readdirSync(out) : [];
	const folder = tags.length === 1 ? join(out, tags[0]!) : undefined;
	return { result, out, folder };
};

describe.each(Object.keys(dialects) as Dialect[])('%s generate', (dialect) => {
	test('--explain does not compute the reverse diff', async () => {
		const { out } = await generate(dialect, { explain: true });

		expect(computeDown).not.toHaveBeenCalled();
		expect(existsSync(out) ? readdirSync(out) : []).toStrictEqual([]);
	});

	test('a failing reverse diff still writes migration.sql and warns instead of failing', async () => {
		computeDown.mockImplementationOnce(() =>
			actualHelpers.computeDown(async () => {
				throw new Error('reverse diff exploded');
			})
		);
		const log = vi.spyOn(console, 'log').mockImplementation(() => {});
		let printed: string;
		let generated: Awaited<ReturnType<typeof generate>>;
		try {
			generated = await generate(dialect, {}, 'text');
			printed = log.mock.calls.map((args) => args.join(' ')).join('\n');
		} finally {
			log.mockRestore();
		}

		const { folder } = generated;
		expect(computeDown).toHaveBeenCalledOnce();
		expect(existsSync(join(folder!, 'migration.sql'))).toBe(true);
		expect(existsSync(join(folder!, 'down.sql'))).toBe(false);
		expect(printed).toContain(`Could not generate a rollback for ${folder!.split(/[\\/]/).at(-1)}`);
		expect(printed).toContain('reverse diff exploded');
	});
});
