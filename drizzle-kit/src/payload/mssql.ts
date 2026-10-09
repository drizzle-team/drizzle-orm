import type { MsSqlDatabase } from 'drizzle-orm/mssql-core';
import type { Hint } from '../cli/hints';
import type { EntitiesFilterConfig } from '../cli/validations/common';
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
	const { humanLog, mssqlSchemaError } = await import('../cli/views');
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
		humanLog(errors.map((it) => mssqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	if (err2.length > 0) {
		humanLog(err2.map((it) => mssqlSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return toJsonSnapshot(ddl, prevId ? [prevId] : [originUUID], []);
};

export const generateMigration = async (
	prev: MssqlSnapshot,
	cur: MssqlSnapshot,
	options?: { hints?: readonly Hint[] },
) => {
	const { resolver } = await import('../cli/prompts');
	const { ddlDiff } = await import('../dialects/mssql/diff');
	const { runWithApiHints } = await import('../cli/hints');
	const from = createDDL();
	const to = createDDL();

	for (const it of prev.ddl) {
		from.entities.push(it);
	}
	for (const it of cur.ddl) {
		to.entities.push(it);
	}

	return runWithApiHints(options?.hints, async (hints) => {
		const { sqlStatements } = await ddlDiff(
			from,
			to,
			resolver<Schema>('schema', hints, 'dbo'),
			resolver<MssqlEntities['tables']>('table', hints, 'dbo'),
			resolver<Column>('column', hints, 'dbo'),
			resolver<View>('view', hints, 'dbo'),
			resolver<UniqueConstraint>('unique', hints, 'dbo'),
			resolver<Index>('index', hints, 'dbo'),
			resolver<CheckConstraint>('check', hints, 'dbo'),
			resolver<PrimaryKey>('primary_key', hints, 'dbo'),
			resolver<ForeignKey>('foreign key', hints, 'dbo'),
			resolver<DefaultConstraint>('default', hints, 'dbo'),
			'default',
		);
		hints.throwIfMissingHints();

		return sqlStatements;
	});
};

export const pushSchema = async (
	imports: Record<string, unknown>,
	drizzleInstance: MsSqlDatabase<any, any>,
	entitiesConfig?: EntitiesFilterConfig,
	migrationsConfig?: {
		table?: string;
		schema?: string;
	},
	options?: { hints?: readonly Hint[] },
) => {
	const { prepareEntityFilter } = await import('src/dialects/pull-utils');
	const { resolver } = await import('../cli/prompts');
	const { fromDatabaseForDrizzle } = await import('src/dialects/mssql/introspect');
	const { fromDrizzleSchema, fromExports } = await import('../dialects/mssql/drizzle');
	const { suggestions } = await import('../cli/commands/push-mssql');
	const { extractMssqlExisting } = await import('../dialects/drizzle');
	const { ddlDiff } = await import('../dialects/mssql/diff');
	const { runWithApiHints } = await import('../cli/hints');
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

	const { ddl: from } = interimToDDL(prev);
	const { ddl: to } = interimToDDL(cur);

	const { sqlStatements, hints } = await runWithApiHints(options?.hints, async (userHints) => {
		const { sqlStatements, statements } = await ddlDiff(
			from,
			to,
			resolver<Schema>('schema', userHints, 'dbo'),
			resolver<MssqlEntities['tables']>('table', userHints, 'dbo'),
			resolver<Column>('column', userHints, 'dbo'),
			resolver<View>('view', userHints, 'dbo'),
			resolver<UniqueConstraint>('unique', userHints, 'dbo'),
			resolver<Index>('index', userHints, 'dbo'),
			resolver<CheckConstraint>('check', userHints, 'dbo'),
			resolver<PrimaryKey>('primary_key', userHints, 'dbo'),
			resolver<ForeignKey>('foreign key', userHints, 'dbo'),
			resolver<DefaultConstraint>('default', userHints, 'dbo'),
			'push',
		);
		// An unresolved rename is diffed as a drop plus a create, so a data loss check on it would report a false drop.
		userHints.throwIfMissingHints();

		const hints = await suggestions(db, statements, to, userHints);
		userHints.throwIfMissingHints();

		return { sqlStatements, hints };
	});

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

export { upToV2 as up } from '../dialects/mssql/versions';

export type { MissingHintsError } from '../cli/errors';
export type { Hint, MissingHint } from '../cli/hints';
