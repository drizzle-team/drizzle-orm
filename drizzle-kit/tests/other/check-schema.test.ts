import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterAll, expect, onTestFinished, test } from 'vitest';
import { check } from '../../src/cli-sdk';
import { stageConflict, stageOut, stageValid } from './check-fixtures';

// The `pnpm test` script sets TEST_CONFIG_PATH_PREFIX=./tests/cli/ for the whole run. That prefix breaks
// the absolute schema paths of this file.
const originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
delete process.env.TEST_CONFIG_PATH_PREFIX;
afterAll(() => {
	if (originalPrefix !== undefined) process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
});

// A schema file with the table `users`. The staged folders hold `users` with the column `id`.
const writeSchema = (out: string, columns: string) => {
	const path = join(out, 'schema.ts');
	writeFileSync(
		path,
		[
			"import { integer, pgTable, varchar } from 'drizzle-orm/pg-core';",
			`export const users = pgTable('users', { ${columns} });`,
		].join('\n'),
	);
	return path;
};
const staged = (out: string) => {
	onTestFinished(() => rmSync(out, { recursive: true, force: true }));
	return out;
};

test('check with a schema that equals the migrations returns the ok envelope without warnings', async () => {
	const out = staged(await stageValid());

	const result = await check({ dialect: 'postgresql', out, schema: writeSchema(out, "id: integer('id')") });

	expect(result).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
});

test('check with a schema that differs from the migrations returns ok with a warning', async () => {
	const out = staged(await stageValid());
	const schema = writeSchema(out, "id: integer('id'), email: varchar('email')");

	const result = await check({ dialect: 'postgresql', out, schema });

	expect(result).toStrictEqual({
		status: 'ok',
		dialect: 'postgresql',
		warnings: [
			'The schema has changes that no migration holds. The newest migration is 0000_init. '
			+ 'Run drizzle-kit generate to write a migration for these changes.',
		],
	});
});

test('check returns ok and says that the schema was not compared when no file matches the schema path', async () => {
	const out = staged(await stageValid());
	const schema = join(out, 'missing.ts');

	const result = await check({ dialect: 'postgresql', out, schema });

	expect(result).toStrictEqual({
		status: 'ok',
		dialect: 'postgresql',
		warnings: [`The schema was not compared with the migrations, because no schema file matches ${schema}.`],
	});
});

test('check reports a conflict as an error and adds no warning', async () => {
	const out = staged(await stageConflict());
	const schema = writeSchema(out, "id: integer('id'), email: varchar('email')");

	const result = await check({ dialect: 'postgresql', out, schema });

	expect(result).toMatchObject({ status: 'error', error: { code: 'check_error', kind: 'conflicts' } });
	expect(result).not.toHaveProperty('warnings');
});

test('check compares the schema only for postgresql', async () => {
	const out = staged(stageOut());

	const result = await check({ dialect: 'sqlite', out, schema: writeSchema(out, "id: integer('id')") });

	expect(result).toStrictEqual({ status: 'ok', dialect: 'sqlite' });
});
