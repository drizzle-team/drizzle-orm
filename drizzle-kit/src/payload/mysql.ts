import type { Relations } from 'drizzle-orm/_relations';
import type { AnyMySqlTable } from 'drizzle-orm/mysql-core';
import type { MysqlCredentials } from '../cli/validations/mysql';
import type { Column, Table, View } from '../dialects/mysql/ddl';
import { createDDL, interimToDDL } from '../dialects/mysql/ddl';
import type { MysqlSnapshot } from '../dialects/mysql/snapshot';
import { originUUID } from '../utils';
import type { DB } from '../utils';

export const generateDrizzleJson = async (
	imports: Record<string, unknown>,
	prevId?: string,
): Promise<MysqlSnapshot> => {
	const { humanLog, mysqlSchemaError } = await import('../cli/views');
	const { toJsonSnapshot } = await import('../dialects/mysql/snapshot');
	const { fromDrizzleSchema, prepareFromExports } = await import('../dialects/mysql/drizzle');
	const prepared = prepareFromExports(imports);

	const interim = fromDrizzleSchema(prepared.tables, prepared.views);

	const { ddl, errors } = interimToDDL(interim);

	if (errors.length > 0) {
		humanLog(errors.map((it) => mysqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return toJsonSnapshot(ddl, prevId ? [prevId] : [originUUID], []);
};

export const generateMigration = async (
	prev: MysqlSnapshot,
	cur: MysqlSnapshot,
) => {
	const { resolver } = await import('../cli/prompts');
	const { ddlDiff } = await import('../dialects/mysql/diff');
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
		resolver<View>('view'),
		'default',
	);

	return sqlStatements;
};

export const pushSchema = async (
	imports: Record<string, unknown>,
	db: DB,
	database: string,
	migrationsConfig?: {
		table?: string;
		schema?: string;
	},
) => {
	const { resolver } = await import('../cli/prompts');
	const { fromDatabaseForDrizzle } = await import('src/dialects/mysql/introspect');
	const { fromDrizzleSchema, prepareFromExports } = await import('../dialects/mysql/drizzle');
	const { suggestions } = await import('../cli/commands/push-mysql');
	const { ddlDiff } = await import('../dialects/mysql/diff');
	const { HintsHandler } = await import('../cli/hints');

	const migrations = {
		schema: migrationsConfig?.schema || '',
		table: migrationsConfig?.table || '__drizzle_migrations',
	};

	const prepared = prepareFromExports(imports);

	const prev = await fromDatabaseForDrizzle(db, database, () => true, () => {}, migrations);
	const cur = fromDrizzleSchema(prepared.tables, prepared.views);

	const { ddl: from } = interimToDDL(prev);
	const { ddl: to } = interimToDDL(cur);

	const { sqlStatements, statements } = await ddlDiff(
		from,
		to,
		resolver<Table>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		'push',
	);

	const hints = await suggestions(db, statements, to, new HintsHandler());

	return {
		sqlStatements,
		hints,
		apply: async () => {
			const losses = hints.map((x) => x.statement).filter((x): x is string => typeof x !== 'undefined');
			for (const st of losses) {
				await db.query(st);
			}
			for (const st of sqlStatements) {
				await db.query(st);
			}
		},
	};
};

export const startStudioServer = async (
	imports: Record<string, unknown>,
	credentials: MysqlCredentials,
	options?: {
		host?: string;
		port?: number;
		key?: string;
		cert?: string;
	},
) => {
	const { is } = await import('drizzle-orm');
	const { MySqlTable, getTableConfig } = await import('drizzle-orm/mysql-core');
	const { Relations } = await import('drizzle-orm/_relations');
	const { drizzleForMySQL, prepareServer } = await import('../cli/commands/studio');
	const { humanLog } = await import('../cli/views');

	const mysqlSchema: Record<string, Record<string, AnyMySqlTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, MySqlTable)) {
			const schema = getTableConfig(t).schema || 'public';
			mysqlSchema[schema] = mysqlSchema[schema] || {};
			mysqlSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForMySQL(credentials, mysqlSchema, relations, []);
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

export { upToV6 as up } from '../cli/commands/up-mysql';
