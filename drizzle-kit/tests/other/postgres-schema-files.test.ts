import { getTableName } from 'drizzle-orm';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { afterEach, beforeEach, expect, test } from 'vitest';
import { interimToDDL } from '../../src/dialects/postgres/ddl';
import { fromDrizzleSchema, prepareFromSchemaFiles } from '../../src/dialects/postgres/drizzle';
import { prepareFilenames } from '../../src/utils/utils-node';

const tmpRoot = resolve(process.cwd(), 'tests/tmp');

let schemaRoot: string;
let originalPrefix: string | undefined;

beforeEach(() => {
	originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
	delete process.env.TEST_CONFIG_PATH_PREFIX;
	mkdirSync(tmpRoot, { recursive: true });
	schemaRoot = mkdtempSync(join(tmpRoot, 'postgres-schema-barrel-'));
});

afterEach(() => {
	rmSync(schemaRoot, { recursive: true, force: true });
	if (originalPrefix === undefined) {
		delete process.env.TEST_CONFIG_PATH_PREFIX;
	} else {
		process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
	}
});

test('deduplicates a table loaded directly and through a schema barrel', async () => {
	writeFileSync(
		join(schemaRoot, 'banners.ts'),
		[
			`import { integer, pgTable, text } from 'drizzle-orm/pg-core';`,
			'',
			`export const banners = pgTable('banners', {`,
			`\theading: text('heading'),`,
			`\tpriority: integer('priority'),`,
			'});',
		].join('\n'),
	);
	writeFileSync(join(schemaRoot, 'index.ts'), `export * from './banners.js';\n`);

	const filenames = prepareFilenames(schemaRoot);
	const prepared = await prepareFromSchemaFiles(filenames);

	expect(filenames).toHaveLength(2);
	expect(prepared.tables).toHaveLength(1);
	expect(getTableName(prepared.tables[0]!)).toBe('banners');

	const { schema, errors } = fromDrizzleSchema(prepared, () => true);
	const { ddl, errors: ddlErrors } = interimToDDL(schema);

	expect(errors).toEqual([]);
	expect(ddlErrors).toEqual([]);
	expect(ddl.tables.list()).toHaveLength(1);
	expect(ddl.columns.list()).toHaveLength(2);
});

test('reloads schema modules between schema-loading batches', async () => {
	const schemaPath = join(schemaRoot, 'table.ts');
	writeFileSync(
		schemaPath,
		`import { pgTable } from 'drizzle-orm/pg-core';\nexport const table = pgTable('before', {});\n`,
	);

	const first = await prepareFromSchemaFiles([schemaPath]);

	writeFileSync(
		schemaPath,
		`import { pgTable } from 'drizzle-orm/pg-core';\nexport const table = pgTable('after', {});\n`,
	);
	const second = await prepareFromSchemaFiles([schemaPath]);

	expect(getTableName(first.tables[0]!)).toBe('before');
	expect(getTableName(second.tables[0]!)).toBe('after');
	expect(second.tables[0]).not.toBe(first.tables[0]);
});
