// Verifies that the SDK `check` and the `check` CLI command compare a postgres schema file with the migrations
// folder and add `warnings` to the `ok` result. The tests cover a schema that equals or differs from the
// migrations, a schema path with no file, a schema file that throws, the text output with exit code 0, a folder
// with conflicts, and sqlite, which `check` does not compare with the schema.
// Each test stages a migrations folder under tests/tmp/ with `check-fixtures` and writes a real schema file into it.
import { rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { afterAll, expect, onTestFinished, test, vi } from 'vitest';
import { check } from '../../src/cli-sdk';
import { runWithCliContext } from '../../src/cli/context';
import { check as checkCommand, prepareCheck } from '../../src/cli/schema';
import { stageConflict, stageOut, stageValid } from './check-fixtures';

// The tests of this file run without TEST_CONFIG_PATH_PREFIX. The `pnpm test` script sets the prefix to
// ./tests/cli/, and drizzle-kit adds the prefix in front of the schema path, so the schema files are not found.
const originalPrefix = process.env.TEST_CONFIG_PATH_PREFIX;
delete process.env.TEST_CONFIG_PATH_PREFIX;
afterAll(() => {
	if (originalPrefix !== undefined) process.env.TEST_CONFIG_PATH_PREFIX = originalPrefix;
});

// Writes a schema file with the table `users` for `check` to compare with the migrations. `stageValid` stages
// `users` with only the column `id`, so any other `columns` make the schema differ from the migrations.
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
		warnings: [{
			kind: 'schema_changed',
			message: 'The schema differs from the migrations. The newest migration is 0000_init. '
				+ 'Run drizzle-kit generate --explain to see the difference, and drizzle-kit generate to write a '
				+ 'migration for it.',
		}],
	});
});

test('check returns ok and says that the schema was not compared when no file matches the schema path', async () => {
	const out = staged(await stageValid());
	const schema = join(out, 'missing.ts');

	const result = await check({ dialect: 'postgresql', out, schema });

	expect(result).toStrictEqual({
		status: 'ok',
		dialect: 'postgresql',
		warnings: [{
			kind: 'not_compared',
			message: `The schema was not compared with the migrations, because no schema file matches ${schema}. `
				+ 'Correct the schema path in the config file or in the --schema option.',
		}],
	});
});

test('check returns ok and says that the schema was not compared when a schema file throws', async () => {
	const out = staged(await stageValid());
	const schema = join(out, 'schema.ts');
	writeFileSync(schema, "throw new Error('no database url');");

	const result = await check({ dialect: 'postgresql', out, schema });

	expect(result).toMatchObject({
		status: 'ok',
		warnings: [{ kind: 'not_compared', message: expect.stringContaining('The error: no database url') }],
	});
});

test('check prints the warning in place of the success line in text mode, and the exit code is 0', async () => {
	const out = staged(await stageValid());
	const schema = writeSchema(out, "id: integer('id'), email: varchar('email')");
	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	const exit = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
	onTestFinished(() => {
		vi.restoreAllMocks();
	});

	await runWithCliContext({ output: 'text', interactive: false }, async () => {
		const config = await prepareCheck({ dialect: 'postgresql', out, schema, output: 'text' });
		await checkCommand.handler!(config as never);
	});

	expect(log).toHaveBeenCalledTimes(1);
	expect(log.mock.calls[0][0]).toContain('The schema differs from the migrations.');
	expect(exit).toHaveBeenCalledWith(0);
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
