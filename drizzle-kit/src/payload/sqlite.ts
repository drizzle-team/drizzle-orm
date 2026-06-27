/// <reference types="@cloudflare/workers-types" />
import type { Relations } from 'drizzle-orm/_relations';
import type { AnySQLiteTable } from 'drizzle-orm/sqlite-core';
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

	const interim = fromDrizzleSchema(prepared.tables, prepared.views);

	const { ddl, errors } = interimToDDL(interim);

	if (errors.length > 0) {
		humanLog(errors.map((it) => sqliteSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return toJsonSnapshot(ddl, randomUUID(), prevId ? [prevId] : [originUUID], []);
};

export const generateMigration = async (
	prev: SqliteSnapshot,
	cur: SqliteSnapshot,
) => {
	const { resolver } = await import('../cli/prompts');
	const { ddlDiff } = await import('../dialects/sqlite/diff');
	const from = createDDL();
	const to = createDDL();

	for (const it of prev.ddl) {
		from.entities.push(it);
	}
	for (const it of cur.ddl) {
		to.entities.push(it);
	}

	const { sqlStatements } = await ddlDiff(
		from,
		to,
		resolver<Table>('table'),
		resolver<Column>('column'),
		'default',
	);

	return sqlStatements;
};

export const pushSchema = async (
	imports: Record<string, unknown>,
	db: SQLiteClient,
	migrationsConfig?: {
		table?: string;
		schema?: string;
	},
) => {
	const { resolver } = await import('../cli/prompts');
	const { fromDatabaseForDrizzle } = await import('src/dialects/sqlite/introspect');
	const { fromDrizzleSchema, fromExports } = await import('../dialects/sqlite/drizzle');
	const { suggestions } = await import('../cli/commands/push-sqlite');
	const { ddlDiff } = await import('../dialects/sqlite/diff');
	const { HintsHandler } = await import('../cli/hints');

	const migrations = {
		schema: migrationsConfig?.schema || '',
		table: migrationsConfig?.table || '__drizzle_migrations',
	};

	const prepared = fromExports(imports);

	const prev = await fromDatabaseForDrizzle(db, () => true, () => {}, migrations);
	const cur = fromDrizzleSchema(prepared.tables, prepared.views);

	const { ddl: from } = interimToDDL(prev);
	const { ddl: to } = interimToDDL(cur);

	const { sqlStatements, statements } = await ddlDiff(
		from,
		to,
		resolver<Table>('table'),
		resolver<Column>('column'),
		'push',
	);

	const hints = await suggestions(db, statements, new HintsHandler());

	return {
		sqlStatements,
		hints,
		apply: async () => {
			const losses = hints.map((x) => x.statement).filter((x): x is string => typeof x !== 'undefined');
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

export { updateToV7 as up } from '../cli/commands/up-sqlite';
