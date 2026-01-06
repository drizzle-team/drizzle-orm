import type { PGlite } from '@electric-sql/pglite';
import type { Relations } from 'drizzle-orm/_relations';
import type { AnyPgTable } from 'drizzle-orm/pg-core';
import type { PgAsyncDatabase } from 'drizzle-orm/pg-core/async';
import type { EntitiesFilterConfig } from 'src/cli/validations/cli';
import { upToV8 } from 'src/dialects/postgres/versions';
import type { CasingType } from '../cli/validations/common';
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
import { originUUID } from '../utils';
import type { DB } from '../utils';

export const generateDrizzleJson = async (
	imports: Record<string, unknown>,
	prevId?: string,
	schemaFilters?: string[],
	casing?: CasingType,
): Promise<PostgresSnapshot> => {
	const { prepareEntityFilter } = await import('src/dialects/pull-utils');
	const { postgresSchemaError, postgresSchemaWarning } = await import('../cli/views');
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
	const { schema: interim, errors, warnings } = fromDrizzleSchema(prepared, casing, filter);

	const { ddl, errors: err2 } = interimToDDL(interim);
	if (warnings.length > 0) {
		console.log(warnings.map((it) => postgresSchemaWarning(it)).join('\n\n'));
	}

	if (errors.length > 0) {
		console.log(errors.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	if (err2.length > 0) {
		console.log(err2.map((it) => postgresSchemaError(it)).join('\n'));
		process.exit(1);
	}

	return toJsonSnapshot(ddl, prevId ? [prevId] : [originUUID], []);
};

export const generateMigration = async (
	prev: PostgresSnapshot,
	cur: PostgresSnapshot,
) => {
	const { resolver } = await import('../cli/prompts');
	const { ddlDiff } = await import('../dialects/postgres/diff');
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
		resolver<Schema>('schema'),
		resolver<Enum>('enum'),
		resolver<Sequence>('sequence'),
		resolver<Policy>('policy'),
		resolver<Role>('role'),
		resolver<Privilege>('privilege'),
		resolver<PostgresEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		resolver<UniqueConstraint>('unique'),
		resolver<Index>('index'),
		resolver<CheckConstraint>('check'),
		resolver<PrimaryKey>('primary key'),
		resolver<ForeignKey>('foreign key'),
		'default',
	);

	return sqlStatements;
};

export const pushSchema = async (
	imports: Record<string, unknown>,
	drizzleInstance: PgAsyncDatabase<any>,
	casing?: CasingType,
	entitiesConfig?: EntitiesFilterConfig,
	migrationsConfig?: {
		table?: string;
		schema?: string;
	},
) => {
	const { prepareEntityFilter } = await import('src/dialects/pull-utils');
	const { resolver } = await import('../cli/prompts');
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
	const { schema: cur } = fromDrizzleSchema(prepared, casing, filter);

	const { ddl: from, errors: _err1 } = interimToDDL(prev);
	const { ddl: to, errors: _err2 } = interimToDDL(cur);

	// TODO: handle errors, for now don't throw

	const { sqlStatements, statements } = await ddlDiff(
		from,
		to,
		resolver<Schema>('schema'),
		resolver<Enum>('enum'),
		resolver<Sequence>('sequence'),
		resolver<Policy>('policy'),
		resolver<Role>('role'),
		resolver<Privilege>('privilege'),
		resolver<PostgresEntities['tables']>('table'),
		resolver<Column>('column'),
		resolver<View>('view'),
		resolver<UniqueConstraint>('unique'),
		resolver<Index>('index'),
		resolver<CheckConstraint>('check'),
		resolver<PrimaryKey>('primary key'),
		resolver<ForeignKey>('foreign key'),
		'push',
	);

	const hints = await suggestions(db, statements);

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
	credentials: PostgresCredentials | {
		driver: 'pglite';
		client: PGlite;
	},
	options?: {
		host?: string;
		port?: number;
		casing?: CasingType;
		key?: string;
		cert?: string;
	},
) => {
	const { is } = await import('drizzle-orm');
	const { PgTable, getTableConfig } = await import('drizzle-orm/pg-core');
	const { Relations } = await import('drizzle-orm/_relations');
	const { drizzleForPostgres, prepareServer } = await import('../cli/commands/studio');

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

	const setup = await drizzleForPostgres(credentials, pgSchema, relations, [], options?.casing);
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
				console.log(`Studio is running at ${options?.key ? 'https' : 'http'}://${host}:${port}`);
			}
		},
	});
};

export const up = upToV8;
