import { integer, pgTable } from 'drizzle-orm/pg-core';
import { writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { makePgSnapshot, ORIGIN, stageOut, writeSnapshot } from '../sdk/check-fixtures';

export { ORIGIN, stageConflict, stageOut, stageValid } from '../sdk/check-fixtures';

/**
 * Stages a generate missing_hints scenario without a live database.
 *
 * Writes a postgres snapshot declaring table `users`, then writes a schema file
 * declaring table `accounts`. Calling `generate({ dialect:'postgresql', schema, out })`
 * on the returned paths causes the rename-detection logic to surface
 * `{ type:'rename_or_create', kind:'table', entity:['public','accounts'] }` with no
 * hints provided — purely filesystem-based, no Docker required.
 */
export const stageGenerateMissingHints = (): { out: string; schemaPath: string } => {
	const out = stageOut();

	writeSnapshot(
		out,
		'0000_init',
		makePgSnapshot('p1', [ORIGIN], { users: pgTable('users', { id: integer('id') }) }),
	);

	const schemaPath = resolve(join(out, 'schema.ts'));
	writeFileSync(
		schemaPath,
		[
			"import { integer, pgTable } from 'drizzle-orm/pg-core';",
			'',
			"export const accounts = pgTable('accounts', { id: integer('id') });",
		].join('\n'),
	);

	return { out, schemaPath };
};

/**
 * Writes a drizzle.config.ts that targets push at an unreachable postgres URL whose connection
 * string embeds a unique sentinel password. Also writes a minimal schema file so push gets past
 * schema resolution and fails at the DB driver level with a database_driver_error envelope.
 *
 * Returns the config path and the sentinel string so the caller can assert the sentinel never
 * appears in any result channel.
 */
export const writeSentinelPushConfig = (out: string): { configPath: string; sentinel: string } => {
	const sentinel = `S3NT1NEL_${Date.now()}_${Math.random().toString(36).slice(2)}`;
	const schemaPath = resolve(join(out, 'schema.ts'));
	// Minimal valid schema — push will reach the DB driver before hitting any schema error
	writeFileSync(
		schemaPath,
		"import { integer, pgTable } from 'drizzle-orm/pg-core';\nexport const t = pgTable('t', { id: integer('id') });\n",
	);
	const configPath = resolve(join(out, 'drizzle-sentinel.config.ts'));
	writeFileSync(
		configPath,
		[
			'export default {',
			"  dialect: 'postgresql',",
			`  schema: ${JSON.stringify(schemaPath)},`,
			`  out: ${JSON.stringify(out)},`,
			// unreachable host; sentinel embedded as the password
			`  dbCredentials: { url: 'postgresql://user:${sentinel}@127.0.0.1:1/none' },`,
			'};',
		].join('\n'),
	);
	return { configPath, sentinel };
};

/**
 * Writes a minimal drizzle.config.ts pointing at the staged out folder (and optionally a schema file).
 * Uses a plain export default object (no `defineConfig` import) so jiti can load it without a built dist.
 */
export const writeDrizzleConfig = (out: string, schemaPath?: string): string => {
	const configPath = resolve(join(out, 'drizzle.config.ts'));
	const schemaLine = schemaPath
		? `  schema: ${JSON.stringify(schemaPath)},`
		: "  schema: './schema.ts',";
	writeFileSync(
		configPath,
		[
			'export default {',
			"  dialect: 'postgresql',",
			schemaLine,
			`  out: ${JSON.stringify(out)},`,
			'};',
		].join('\n'),
	);
	return configPath;
};
