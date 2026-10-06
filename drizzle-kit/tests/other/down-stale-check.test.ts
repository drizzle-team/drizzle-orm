import { createHash } from 'crypto';
import { integer, pgTable, text } from 'drizzle-orm/pg-core';
import { appendFileSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { check as sdkCheck } from 'src/cli-sdk';
import { handle as generatePostgres } from 'src/cli/commands/generate-postgres';
import { runWithCliContext } from 'src/cli/context';
import { HintsHandler } from 'src/cli/hints';
import { runCheck } from 'src/cli/schema';
import { fromExports, SchemaSource } from 'src/dialects/postgres/drizzle';
import type { PostgresSchema } from 'tests/postgres/mocks';
import { expect, test, vi } from 'vitest';

const generate = async (schema: PostgresSchema, custom = false) => {
	const out = mkdtempSync(join(tmpdir(), 'drizzle-kit-down-stale-'));
	await runWithCliContext({ output: 'json', interactive: false }, () =>
		generatePostgres({
			out,
			filenames: ['schema.ts'],
			schemaSource: SchemaSource.fromSchema(fromExports(schema)),
			custom,
			name: 'init',
			breakpoints: true,
			generateDownMigrations: true,
			explain: false,
			hints: new HintsHandler(),
		} as never));
	const [tag] = readdirSync(out);
	return {
		out,
		migrationPath: join(out, tag!, 'migration.sql'),
		downPath: join(out, tag!, 'down.sql'),
	};
};

const sha256 = (input: string) => createHash('sha256').update(input).digest('hex');

test('generated down.sql is stamped with the hash drizzle-orm computes for migration.sql', async () => {
	const { migrationPath, downPath } = await generate({ users: pgTable('users', { id: integer(), name: text() }) });

	const firstLine = readFileSync(downPath, 'utf8').split('\n')[0];
	expect(firstLine).toBe(`-- drizzle:up-hash=${sha256(readFileSync(migrationPath).toString())}`);
});

// The scaffold is written against a placeholder migration.sql the user is about to replace,
// so a stamp would flag every custom migration as stale.
test('custom migration scaffold is not stamped', async () => {
	const { out, migrationPath, downPath } = await generate({}, true);
	writeFileSync(migrationPath, 'UPDATE "users" SET "name" = trim("name");');

	expect(readFileSync(downPath, 'utf8')).not.toContain('drizzle:up-hash');
	expect(await sdkCheck({ dialect: 'postgresql', out })).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
});

test('check is quiet when migration.sql is unchanged', async () => {
	const { out } = await generate({ users: pgTable('users', { id: integer() }) });

	expect(await sdkCheck({ dialect: 'postgresql', out })).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
});

test('check warns when migration.sql changed after down.sql was generated', async () => {
	const { out, migrationPath, downPath } = await generate({ users: pgTable('users', { id: integer() }) });
	appendFileSync(migrationPath, '\nCREATE INDEX "users_id_idx" ON "users" ("id");');

	expect(await sdkCheck({ dialect: 'postgresql', out })).toStrictEqual({
		status: 'ok',
		dialect: 'postgresql',
		staleDownMigrations: [downPath],
	});

	const log = vi.spyOn(console, 'log').mockImplementation(() => {});
	try {
		await runWithCliContext(
			{ output: 'text', interactive: false },
			() => runCheck({ out, dialect: 'postgresql', output: 'text' } as never),
		);
		const printed = log.mock.calls.map((args) => args.join(' ')).join('\n');
		expect(printed).toContain(downPath);
		expect(printed).toContain('drizzle:up-hash');
	} finally {
		log.mockRestore();
	}
});

test('check skips down.sql files without a stamp', async () => {
	const { out, migrationPath, downPath } = await generate({ users: pgTable('users', { id: integer() }) });
	const [, ...rest] = readFileSync(downPath, 'utf8').split('\n');
	writeFileSync(downPath, rest.join('\n'));
	appendFileSync(migrationPath, '\nSELECT 1;');

	expect(await sdkCheck({ dialect: 'postgresql', out })).toStrictEqual({ status: 'ok', dialect: 'postgresql' });
});
