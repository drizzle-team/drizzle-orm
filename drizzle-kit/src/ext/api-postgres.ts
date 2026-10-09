import type { Relations } from 'drizzle-orm/_relations';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async';
import type { Hint } from '../cli/hints';
import type { EntitiesFilterConfig } from '../cli/validations/common';
import type { PostgresCredentials } from '../cli/validations/postgres';
import type {
	CheckConstraint,
	Column,
	Enum,
	ForeignKey,
	Index,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Privilege,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from '../dialects/postgres/ddl';
import { createDDL, interimToDDL } from '../dialects/postgres/ddl';
import type { PostgresSnapshot } from '../dialects/postgres/snapshot';
import { upToV8 } from '../dialects/postgres/versions';
import { originUUID } from '../utils';
import type { DB } from '../utils';

export const generateDrizzleJson = async (
	imports: Record<string, unknown>,
	prevId?: string,
	schemaFilters?: string[],
): Promise<PostgresSnapshot> => {
	const { prepareEntityFilter } = await import('src/dialects/pull-utils');
	const { humanLog, postgresSchemaError, postgresSchemaWarning } = await import('../cli/views');
	const { toJsonSnapshot } = await import('../dialects/postgres/snapshot');
	const { fromDrizzleSchema, fromExports } = await import('../dialects/postgres/drizzle');
	const { extractPostgresExisting } = await import('../dialects/drizzle');
	const prepared = fromExports(imports);

	const existing = extractPostgresExisting(prepared.schemas, prepared.views, prepared.matViews);

	const filter = prepareEntityFilter('postgresql', {
		schemas: schemaFilters ?? [],
		tables: [],
		entities: undefined,
		extensions: [],
	}, existing);

	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema: interim, errors, warnings } = fromDrizzleSchema(prepared, filter);

	const { ddl, errors: err2 } = interimToDDL(interim);
	if (warnings.length > 0) {
		humanLog(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		humanLog(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	if (err2.length > 0) {
		humanLog(err2.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return toJsonSnapshot(ddl, prevId ? [prevId] : [originUUID], []);
};

export const generateMigration = async (
	prev: PostgresSnapshot,
	cur: PostgresSnapshot,
	options?: { hints?: readonly Hint[] },
) => {
	const { resolver } = await import('../cli/prompts');
	const { ddlDiff } = await import('../dialects/postgres/diff');
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
			resolver<Schema>('schema', hints),
			resolver<Enum>('enum', hints),
			resolver<Sequence>('sequence', hints),
			resolver<Policy>('policy', hints),
			resolver<Role>('role', hints),
			resolver<Privilege>('privilege', hints),
			resolver<PostgresEntities['tables']>('table', hints),
			resolver<Column>('column', hints),
			resolver<View>('view', hints),
			resolver<UniqueConstraint>('unique', hints),
			resolver<Index>('index', hints),
			resolver<CheckConstraint>('check', hints),
			resolver<PrimaryKey>('primary_key', hints),
			resolver<ForeignKey>('foreign key', hints),
			'default',
		);
		hints.throwIfMissingHints();

		return sqlStatements;
	});
};

export const pushSchema = async (
	imports: Record<string, unknown>,
	drizzleInstance: PgAsyncDatabase<any>,
	entitiesConfig?: EntitiesFilterConfig,
	migrationsConfig?: {
		table?: string;
		schema?: string;
	},
	options?: { hints?: readonly Hint[] },
) => {
	const { prepareEntityFilter } = await import('src/dialects/pull-utils');
	const { resolver } = await import('../cli/prompts');
	const { runWithApiHints } = await import('../cli/hints');
	const { fromDatabaseForDrizzle } = await import('src/dialects/postgres/introspect');
	const { fromDrizzleSchema, fromExports } = await import('../dialects/postgres/drizzle');
	const { suggestions } = await import('../cli/commands/push-postgres');
	const { extractPostgresExisting } = await import('../dialects/drizzle');
	const { ddlDiff } = await import('../dialects/postgres/diff');
	const { sql } = await import('drizzle-orm');

	const migrations = {
		schema: migrationsConfig?.schema || 'drizzle',
		table: migrationsConfig?.table || '__drizzle_migrations',
	};

	const db: DB = {
		query: async (query: string, _params?: any[]) => {
			const res = await drizzleInstance.execute(sql.raw(query));
			return res.rows;
		},
	};
	const prepared = fromExports(imports);

	const filterConfig = entitiesConfig ?? {
		tables: [],
		schemas: [],
		extensions: [],
		entities: undefined,
	} satisfies EntitiesFilterConfig;
	const existing = extractPostgresExisting(prepared.schemas, prepared.views, prepared.matViews);
	const filter = prepareEntityFilter('postgresql', filterConfig, existing);

	const prev = await fromDatabaseForDrizzle(db, filter, () => {}, migrations);

	// TODO: filter?
	// TODO: do we wan't to export everything or ignore .existing and respect entity filters in config
	const { schema: cur } = fromDrizzleSchema(prepared, filter);

	const { ddl: from, errors: _err1 } = interimToDDL(prev);
	const { ddl: to, errors: _err2 } = interimToDDL(cur);

	// TODO: handle errors, for now don't throw

	const { sqlStatements, hints } = await runWithApiHints(options?.hints ?? [], async (userHints) => {
		const { sqlStatements, statements } = await ddlDiff(
			from,
			to,
			resolver<Schema>('schema', userHints),
			resolver<Enum>('enum', userHints),
			resolver<Sequence>('sequence', userHints),
			resolver<Policy>('policy', userHints),
			resolver<Role>('role', userHints),
			resolver<Privilege>('privilege', userHints),
			resolver<PostgresEntities['tables']>('table', userHints),
			resolver<Column>('column', userHints),
			resolver<View>('view', userHints),
			resolver<UniqueConstraint>('unique', userHints),
			resolver<Index>('index', userHints),
			resolver<CheckConstraint>('check', userHints),
			resolver<PrimaryKey>('primary_key', userHints),
			resolver<ForeignKey>('foreign key', userHints),
			'push',
		);
		// An unresolved rename is diffed as a drop plus a create, so a data loss check on it would report a false drop.
		userHints.throwIfMissingHints();

		const hints = await suggestions(db, statements, userHints);
		userHints.throwIfMissingHints();

		return { sqlStatements, hints };
	});

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
	imports: Record<string, unknown>,
	credentials: PostgresCredentials,
	options?: {
		host?: string;
		port?: number;
		key?: string;
		cert?: string;
	},
) => {
	const { is } = await import('drizzle-orm');
	const { PgTable, getTableConfig } = await import('drizzle-orm/pg-core');
	const { Relations } = await import('drizzle-orm/_relations');
	const { drizzleForPostgres, prepareServer } = await import('../cli/commands/studio');
	const { humanLog: studioLog } = await import('../cli/views');

	const pgSchema: Record<string, Record<string, AnyPgTable>> = {};
	const relations: Record<string, Relations> = {};

	Object.entries(imports).forEach(([k, t]) => {
		if (is(t, PgTable)) {
			const schema = getTableConfig(t).schema || 'public';
			pgSchema[schema] = pgSchema[schema] || {};
			pgSchema[schema][k] = t;
		}

		if (is(t, Relations)) {
			relations[k] = t;
		}
	});

	const setup = await drizzleForPostgres(credentials, pgSchema, relations, []);
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
				studioLog(`Studio is running at ${options?.key ? 'https' : 'http'}://${host}:${port}`);
			}
		},
	});
};

export const up = upToV8;

export type { MissingHintsError } from '../cli/errors';
export type { Hint, MissingHint } from '../cli/hints';
