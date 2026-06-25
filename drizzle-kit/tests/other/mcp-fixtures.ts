import { integer, pgTable } from 'drizzle-orm/pg-core';
import { writeFileSync } from 'fs';
import { join, resolve } from 'path';
import { makePgSnapshot, ORIGIN, stageOut, writeSnapshot } from './check-fixtures';

export { ORIGIN, stageConflict, stageOut, stageValid } from './check-fixtures';

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
 * Writes a drizzle.config.ts that targets pull at an unreachable postgres URL. Pull introspects
 * the live DB, so no schema file is needed — it fails at the DB driver level.
 */
export const writeUnreachablePullConfig = (out: string): { configPath: string } => {
	const configPath = resolve(join(out, 'drizzle-unreachable-pull.config.ts'));
	writeFileSync(
		configPath,
		[
			'export default {',
			"  dialect: 'postgresql',",
			`  out: ${JSON.stringify(out)},`,
			`  dbCredentials: { url: 'postgresql://user:pw@127.0.0.1:1/none' },`,
			'};',
		].join('\n'),
	);
	return { configPath };
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
