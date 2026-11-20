/// <reference types="@cloudflare/workers-types" />
import type { Relations } from 'drizzle-orm/_relations';
import type { AnySQLiteTable } from 'drizzle-orm/sqlite-core';
import type { SQLiteAsyncDatabase } from 'drizzle-orm/sqlite-core/async';
import type { Hint } from '../cli/hints';
import type { EntitiesFilterConfig } from '../cli/validations/common';
import type { SqliteCredentials } from '../cli/validations/sqlite';
import type { Column, Table } from '../dialects/sqlite/ddl';
import { createDDL, interimToDDL } from '../dialects/sqlite/ddl';
import type { SqliteSnapshot } from '../dialects/sqlite/snapshot';
import { originUUID } from '../utils';
import type { SQLiteClient } from '../utils';

export const generateDrizzleJson = async (
	imports: Record<string, unknown>,
	prevId?: string,
): Promise<SqliteSnapshot> => {
	const { randomUUID } = await import('crypto');
	const { humanLog, sqliteSchemaError } = await import('../cli/views');
	const { toJsonSnapshot } = await import('../dialects/sqlite/snapshot');
	const { fromDrizzleSchema, fromExports } = await import('../dialects/sqlite/drizzle');
	const prepared = fromExports(imports);

	const { schema: interim } = fromDrizzleSchema(prepared.tables, prepared.views);

	const { ddl, errors } = interimToDDL(interim);

	if (errors.length > 0) {
		humanLog(errors.map((it) => sqliteSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return toJsonSnapshot(ddl, randomUUID(), prevId ? [prevId] : [originUUID], []);
};

// Returns the SQL statements that turn `prev` into `cur`, and the hints that the run applied.
export const generateMigration = async (
	prev: SqliteSnapshot,
	cur: SqliteSnapshot,
	options?: { hints?: Hint[]; interactive?: boolean },
): Promise<{ sqlStatements: string[]; hints: Hint[] }> => {
	const { resolver } = await import('../cli/prompts');
	const { ddlDiff } = await import('../dialects/sqlite/diff');
	const { runWithApiHints } = await import('../cli/hints');
	const from = createDDL();
	const to = createDDL();

	for (const it of prev.ddl) {
		from.entities.push(it);
	}
	for (const it of cur.ddl) {
		to.entities.push(it);
	}

	return runWithApiHints(options?.hints ?? [], async (hints) => {
		const { sqlStatements } = await ddlDiff(
			from,
			to,
			resolver<Table>('table', hints),
			resolver<Column>('column', hints),
			'default',
		);
		hints.throwIfMissingHints();

		return { sqlStatements, hints: hints.resolvedHints };
	}, options?.interactive);
};

// Returns the SQL statements that turn the database into the schema of `imports`, the data loss warnings, the hints
// that the run applied, and `apply`, which runs the statements. With `interactive`, the data loss checks do not ask
// for confirmations. They return `warnings`, and the caller shows them before it calls `apply`.
export const pushSchema = async (
	imports: Record<string, unknown>,
	drizzleInstance: SQLiteAsyncDatabase<any, any, any>,
	entitiesConfig?: EntitiesFilterConfig,
	migrationsConfig?: {
		table?: string;
		schema?: string;
	},
	options?: { hints?: Hint[]; interactive?: boolean },
) => {
	const { sql } = await import('drizzle-orm');
	const { resolver } = await import('../cli/prompts');
	const { prepareEntityFilter } = await import('../dialects/pull-utils');
	const { extractSqliteExisting } = await import('../dialects/drizzle');
	const { fromDatabaseForDrizzle } = await import('../dialects/sqlite/introspect');
	const { fromDrizzleSchema, fromExports } = await import('../dialects/sqlite/drizzle');
	const { suggestions } = await import('../cli/commands/push-sqlite');
	const { ddlDiff } = await import('../dialects/sqlite/diff');
	const { runWithApiHints } = await import('../cli/hints');

	const migrations = {
		schema: migrationsConfig?.schema || '',
		table: migrationsConfig?.table || '__drizzle_migrations',
	};

	const run = async (query: string) => {
		await drizzleInstance.run(sql.raw(query));
	};
	const db: SQLiteClient = {
		query: async <T>(query: string) => (await drizzleInstance.all(sql.raw(query))) as T[],
		run,
		// libsql and D1 run a batch in one transaction. Other drivers run the statements one by one.
		batch: async (statements: string[]) => {
			const batch = (drizzleInstance as { batch?: (items: unknown[]) => Promise<unknown> }).batch;
			if (batch && statements.length > 0) {
				await batch.call(drizzleInstance, statements.map((it) => drizzleInstance.run(sql.raw(it))));
				return;
			}
			for (const statement of statements) await run(statement);
		},
	};

	const prepared = fromExports(imports);
	const filterConfig = entitiesConfig ?? {
		tables: [],
		schemas: [],
		extensions: [],
		entities: undefined,
	} satisfies EntitiesFilterConfig;
	const filter = prepareEntityFilter('sqlite', filterConfig, extractSqliteExisting(prepared.views));

	const prev = await fromDatabaseForDrizzle(db, filter, () => {}, migrations);
	const { schema: cur, metadata } = fromDrizzleSchema(prepared.tables, prepared.views);

	const { ddl: from } = interimToDDL(prev);
	const { ddl: to } = interimToDDL(cur);

	const { sqlStatements, warnings, hints } = await runWithApiHints(options?.hints ?? [], async (userHints) => {
		const { sqlStatements, statements } = await ddlDiff(
			from,
			to,
			resolver<Table>('table', userHints),
			resolver<Column>('column', userHints),
			'push',
			metadata,
		);
		// An unresolved rename is diffed as a drop plus a create, so a data loss check on it would report a false drop.
		userHints.throwIfMissingHints();

		const warnings = await suggestions(db, statements, userHints);
		userHints.throwIfMissingHints();

		return { sqlStatements, warnings, hints: userHints.resolvedHints };
	}, options?.interactive);

	return {
		sqlStatements,
		warnings,
		hints,
		apply: async () => {
			const losses = warnings.map((x) => x.statement).filter((x): x is string => typeof x !== 'undefined');
			await db.batch([...losses, ...sqlStatements]);
		},
	};
};

export const startStudioServer = async (
	imports: Record<string, unknown>,
	credentials: SqliteCredentials | {
		driver: 'd1';
		binding: D1Database;
	},
	options?: {
		host?: string;
		port?: number;
		key?: string;
		cert?: string;
	},
) => {
	const { is } = await import('drizzle-orm');
	const { SQLiteTable } = await import('drizzle-orm/sqlite-core');
	const { Relations } = await import('drizzle-orm/_relations');
	const { drizzleForSQLite, prepareServer } = await import('../cli/commands/studio');
	const { humanLog } = await import('../cli/views');

	const sqliteSchema: Record<string, Record<string, AnySQLiteTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, SQLiteTable)) {
			const schema = 'public'; // sqlite does not have schemas
			sqliteSchema[schema] = sqliteSchema[schema] || {};
			sqliteSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForSQLite(credentials, sqliteSchema, relations, []);
	const server = await prepareServer(setup);

	const host = options?.host || '127.0.0.1';
	const port = options?.port || 4983;
	server.start({
		host,
		port,
		key: options?.key,
		cert: options?.cert,
		cb: (err) => {
			if (err) {
				console.error(err);
			} else {
				humanLog(`Studio is running at ${options?.key ? 'https' : 'http'}://${host}:${port}`);
			}
		},
	});
};

// Converts the snapshots of a migrations folder to the latest format, and returns each snapshot under its folder
// name. `files` maps each migration folder name to the parsed JSON of its snapshot.json. SQLite has no conversion
// hints. `hints` is always empty, so that both dialects return one shape.
export const up = async (
	files: Record<string, unknown>,
): Promise<{ snapshots: Record<string, SqliteSnapshot>; hints: string[] }> => {
	const { upToV7 } = await import('../cli/commands/up-sqlite');
	const snapshots = Object.fromEntries(
		Object.entries(files).map(([folder, raw]) => {
			const snapshot = raw as Record<string, any>;
			return [folder, Number(snapshot.version) < 7 ? upToV7(snapshot) : snapshot as SqliteSnapshot];
		}),
	);
	return { snapshots, hints: [] };
};

export type { MissingHintsError } from '../cli/errors';
export type { Hint, MissingHint } from '../cli/hints';
