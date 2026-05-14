import type { MsSqlDatabase } from 'drizzle-orm/mssql-core';
import type { EntitiesFilterConfig } from 'src/cli/validations/cli';
import { upToV2 } from 'src/dialects/mssql/versions';
import type { MssqlCredentials } from '../cli/validations/mssql';
import type {
	CheckConstraint,
	Column,
	DefaultConstraint,
	ForeignKey,
	Index,
	MssqlEntities,
	PrimaryKey,
	Schema,
	UniqueConstraint,
	View,
} from '../dialects/mssql/ddl';
import { createDDL, interimToDDL } from '../dialects/mssql/ddl';
import type { MssqlSnapshot } from '../dialects/mssql/snapshot';
import { originUUID } from '../utils';
import type { DB } from '../utils';

export const generateDrizzleJson = async (
	imports: Record<string, unknown>,
	prevId?: string,
	schemaFilters?: string[],
): Promise<MssqlSnapshot> => {
	const { prepareEntityFilter } = await import('src/dialects/pull-utils');
	const { mssqlSchemaError } = await import('../cli/views');
	const { toJsonSnapshot } = await import('../dialects/mssql/snapshot');
	const { fromDrizzleSchema, fromExports } = await import('../dialects/mssql/drizzle');
	const { extractMssqlExisting } = await import('../dialects/drizzle');
	const prepared = fromExports(imports);

	const existing = extractMssqlExisting(prepared.schemas, prepared.views);

	const filter = prepareEntityFilter('mssql', {
		schemas: schemaFilters ?? [],
		tables: [],
		entities: undefined,
		extensions: [],
	}, existing);

	const { schema: interim, errors } = fromDrizzleSchema(prepared, filter);

	const { ddl, errors: err2 } = interimToDDL(interim);

	if (errors.length > 0) {
		console.log(errors.map((it) => mssqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	if (err2.length > 0) {
		console.log(err2.map((it) => mssqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return toJsonSnapshot(ddl, prevId ? [prevId] : [originUUID], []);
};

export const generateMigration = async (
	prev: MssqlSnapshot,
	cur: MssqlSnapshot,
) => {
	const { resolver } = await import('../cli/prompts');
	const { ddlDiff } = await import('../dialects/mssql/diff');
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
		resolver<Schema>('schema', 'dbo'),
		resolver<MssqlEntities['tables']>('table', 'dbo'),
		resolver<Column>('column', 'dbo'),
		resolver<View>('view', 'dbo'),
		resolver<UniqueConstraint>('unique', 'dbo'),
		resolver<Index>('index', 'dbo'),
		resolver<CheckConstraint>('check', 'dbo'),
		resolver<PrimaryKey>('primary key', 'dbo'),
		resolver<ForeignKey>('foreign key', 'dbo'),
		resolver<DefaultConstraint>('default', 'dbo'),
		'default',
	);

	return sqlStatements;
};

export const pushSchema = async (
	imports: Record<string, unknown>,
	drizzleInstance: MsSqlDatabase<any, any>,
	entitiesConfig?: EntitiesFilterConfig,
	migrationsConfig?: {
		table?: string;
		schema?: string;
	},
) => {
	const { prepareEntityFilter } = await import('src/dialects/pull-utils');
	const { resolver } = await import('../cli/prompts');
	const { fromDatabaseForDrizzle } = await import('src/dialects/mssql/introspect');
	const { fromDrizzleSchema, fromExports } = await import('../dialects/mssql/drizzle');
	const { suggestions } = await import('../cli/commands/push-mssql');
	const { extractMssqlExisting } = await import('../dialects/drizzle');
	const { ddlDiff } = await import('../dialects/mssql/diff');
	const { sql } = await import('drizzle-orm');

	const migrations = {
		schema: migrationsConfig?.schema || 'dbo',
		table: migrationsConfig?.table || '__drizzle_migrations',
	};

	const db: DB = {
		query: async (query: string, _params?: any[]) => {
			const res = await drizzleInstance.execute(sql.raw(query));
			return (res as any).recordset ?? res;
		},
	};
	const prepared = fromExports(imports);

	const filterConfig = entitiesConfig ?? {
		tables: [],
		schemas: [],
		extensions: [],
		entities: undefined,
	} satisfies EntitiesFilterConfig;
	const existing = extractMssqlExisting(prepared.schemas, prepared.views);
	const filter = prepareEntityFilter('mssql', filterConfig, existing);

	const prev = await fromDatabaseForDrizzle(db, filter, () => {}, migrations);

	const { schema: cur } = fromDrizzleSchema(prepared, filter);

	const { ddl: from, errors: _err1 } = interimToDDL(prev);
	const { ddl: to, errors: _err2 } = interimToDDL(cur);

	const { sqlStatements, statements } = await ddlDiff(
		from,
		to,
		resolver<Schema>('schema', 'dbo'),
		resolver<MssqlEntities['tables']>('table', 'dbo'),
		resolver<Column>('column', 'dbo'),
		resolver<View>('view', 'dbo'),
		resolver<UniqueConstraint>('unique', 'dbo'),
		resolver<Index>('index', 'dbo'),
		resolver<CheckConstraint>('check', 'dbo'),
		resolver<PrimaryKey>('primary key', 'dbo'),
		resolver<ForeignKey>('foreign key', 'dbo'),
		resolver<DefaultConstraint>('default', 'dbo'),
		'push',
	);

	const hints = await suggestions(db, statements, to);

	return {
		sqlStatements,
		hints,
		apply: async () => {
			const losses = hints.map((x) => x.statement).filter((x) => typeof x !== 'undefined');
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
	_imports: Record<string, unknown>,
	_credentials: MssqlCredentials,
	_options?: {
		host?: string;
		port?: number;
		key?: string;
		cert?: string;
	},
) => {
	throw new Error('Studio for MSSQL is not yet supported');
};

export const up = upToV2;
