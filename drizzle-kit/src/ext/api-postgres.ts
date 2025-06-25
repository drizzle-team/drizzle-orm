import type { PgDatabase } from 'drizzle-orm/pg-core';
import { upToV8 } from 'src/cli/commands/up-postgres';
import { introspect } from '../cli/commands/pull-postgres';
import { suggestions } from '../cli/commands/push-postgres';
import { resolver } from '../cli/prompts';
import type { CasingType } from '../cli/validations/common';
import { postgresSchemaError, postgresSchemaWarning, ProgressView } from '../cli/views';
import {
	CheckConstraint,
	Column,
	createDDL,
	Enum,
	ForeignKey,
	Index,
	interimToDDL,
	Policy,
	PostgresEntities,
	PrimaryKey,
	Role,
	Schema,
	Sequence,
	UniqueConstraint,
	View,
} from '../dialects/postgres/ddl';
import { fromDrizzleSchema, fromExports } from '../dialects/postgres/drizzle';
import { PostgresSnapshot, toJsonSnapshot } from '../dialects/postgres/snapshot';
import type { Config } from '../index';
import { getTablesFilterByExtensions, originUUID } from '../utils';
import type { DB } from '../utils';

export const generateDrizzleJson = (
	imports: Record<string, unknown>,
	prevId?: string,
	schemaFilters?: string[],
	casing?: CasingType,
): PostgresSnapshot => {
	const prepared = fromExports(imports);
	const { schema: interim, errors, warnings } = fromDrizzleSchema(prepared, casing, schemaFilters);

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
	schemaFilters?: string[],
	tablesFilter?: string[],
	extensionsFilters?: Config['extensionsFilters'],
) => {
	const { ddlDiff } = await import('../dialects/postgres/diff');
	const { sql } = await import('drizzle-orm');
	const filters = (tablesFilter ?? []).concat(
		getTablesFilterByExtensions({ extensionsFilters, dialect: 'postgresql' }),
	);

	const db: DB = {
		query: async (query: string, params?: any[]) => {
			const res = await drizzleInstance.execute(sql.raw(query));
			return res.rows;
		},
	};

	const progress = new ProgressView('Pulling schema from database...', 'Pulling schema from database...');
	const { schema: prev } = await introspect(db, filters, schemaFilters ?? ['public'], undefined, progress);

	const prepared = fromExports(imports);
	const { schema: cur, errors, warnings } = fromDrizzleSchema(prepared, casing, schemaFilters);

	const { ddl: from, errors: err1 } = interimToDDL(prev);
	const { ddl: to, errors: err2 } = interimToDDL(cur);

	// TODO: handle errors, for now don't throw

	const { sqlStatements, statements } = await ddlDiff(
		from,
		to,
		resolver<Schema>('schema'),
		resolver<Enum>('enum'),
		resolver<Sequence>('sequence'),
		resolver<Policy>('policy'),
		resolver<Role>('role'),
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
