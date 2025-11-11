import type { PgDatabase } from 'drizzle-orm/pg-core';
import { upToV8 } from 'src/cli/commands/up-postgres';
import type { EntitiesFilterConfig } from 'src/cli/validations/cli';
import { prepareEntityFilter } from 'src/dialects/pull-utils';
import { introspect } from '../cli/commands/pull-postgres';
import { suggestions } from '../cli/commands/push-postgres';
import { resolver } from '../cli/prompts';
import type { CasingType } from '../cli/validations/common';
import { postgresSchemaError, postgresSchemaWarning, ProgressView } from '../cli/views';
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
import { fromDrizzleSchema, fromExports } from '../dialects/postgres/drizzle';
import type { PostgresSnapshot } from '../dialects/postgres/snapshot';
import { toJsonSnapshot } from '../dialects/postgres/snapshot';
import { originUUID } from '../utils';
import type { DB } from '../utils';

export const generateDrizzleJson = (
	imports: Record<string, unknown>,
	prevId?: string,
	schemaFilters?: string[],
	casing?: CasingType,
): PostgresSnapshot => {
	const prepared = fromExports(imports);
	// TODO: ??
	const filter = prepareEntityFilter('postgresql', {
		schemas: schemaFilters ?? [],
		tables: [],
		drizzleSchemas: [],
		entities: undefined,
		extensions: [],
	});

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

	return toJsonSnapshot(ddl, prevId ?? originUUID, []);
};

export const generateMigration = async (
	prev: PostgresSnapshot,
	cur: PostgresSnapshot,
) => {
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
	drizzleInstance: PgDatabase<any>,
	casing?: CasingType,
	entitiesConfig?: EntitiesFilterConfig,
) => {
	const { ddlDiff } = await import('../dialects/postgres/diff');
	const { sql } = await import('drizzle-orm');

	const db: DB = {
		query: async (query: string, _params?: any[]) => {
			const res = await drizzleInstance.execute(sql.raw(query));
			return res.rows;
		},
	};

	const progress = new ProgressView('Pulling schema from database...', 'Pulling schema from database...');

	const filterConfig = entitiesConfig ?? {
		tables: [],
		schemas: [],
		extensions: [],
		entities: undefined,
	} satisfies EntitiesFilterConfig;

	const filter = prepareEntityFilter('postgresql', { ...filterConfig, drizzleSchemas: [] });
	const { schema: prev } = await introspect(db, filter, progress);

	const prepared = fromExports(imports);
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

	const { hints, losses } = await suggestions(db, statements);

	return {
		sqlStatements,
		hints,
		losses,
		apply: async () => {
			for (const st of losses) {
				await db.query(st);
			}
			for (const st of sqlStatements) {
				await db.query(st);
			}
		},
	};
};

export const up = upToV8;
