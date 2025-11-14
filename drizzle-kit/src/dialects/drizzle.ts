import type { SQL } from 'drizzle-orm';
import { CasingCache, toCamelCase, toSnakeCase } from 'drizzle-orm/casing';
import {
	type CockroachMaterializedView,
	type CockroachSchema,
	type CockroachView,
	getMaterializedViewConfig as crdbMatViewConfig,
	getViewConfig as crdbViewConfig,
} from 'drizzle-orm/cockroach-core';
import { getViewConfig as mssqlViewConfig, type MsSqlSchema, type MsSqlView } from 'drizzle-orm/mssql-core';
import { getViewConfig as mysqlViewConfig, type MySqlView } from 'drizzle-orm/mysql-core';
import {
	getMaterializedViewConfig as pgMatViewConfig,
	getViewConfig as pgViewConfig,
	type PgMaterializedView,
	type PgSchema,
	type PgView,
} from 'drizzle-orm/pg-core';
import { getViewConfig as sqliteViewConfig, type SQLiteView } from 'drizzle-orm/sqlite-core';
import type { CasingType } from '../cli/validations/common';
import type { Schema, Table } from './pull-utils';

export const extractPostgresExisting = (
	schemas: PgSchema[],
	views: PgView[],
	matViews: PgMaterializedView[],
): (Schema | Table)[] => {
	const existingSchemas = schemas.filter((x) => x.isExisting).map<Schema>((x) => ({
		type: 'schema',
		name: x.schemaName,
	}));
	const existingViews = views.map((x) => pgViewConfig(x)).filter((x) => x.isExisting).map<Table>((x) => ({
		type: 'table',
		schema: x.schema ?? 'public',
		name: x.name,
	}));
	const existingMatViews = matViews.map((x) => pgMatViewConfig(x)).filter((x) => x.isExisting).map<Table>((
		x,
	) => ({
		type: 'table',
		schema: x.schema ?? 'public',
		name: x.name,
	}));

	return [...existingSchemas, ...existingViews, ...existingMatViews];
};

export const extractCrdbExisting = (
	schemas: CockroachSchema[],
	views: CockroachView[],
	matViews: CockroachMaterializedView[],
): (Schema | Table)[] => {
	const existingSchemas = schemas.filter((x) => x.isExisting).map<Schema>((x) => ({
		type: 'schema',
		name: x.schemaName,
	}));
	const existingViews = views.map((x) => crdbViewConfig(x)).filter((x) => x.isExisting).map<Table>((x) => ({
		type: 'table',
		schema: x.schema ?? 'public',
		name: x.name,
	}));

	const existingMatViews = matViews.map((x) => crdbMatViewConfig(x)).filter((x) => x.isExisting).map<Table>((
		x,
	) => ({
		type: 'table',
		schema: x.schema ?? 'public',
		name: x.name,
	}));

	return [...existingSchemas, ...existingViews, ...existingMatViews];
};

export const extractMssqlExisting = (
	schemas: MsSqlSchema[],
	views: MsSqlView[],
): (Schema | Table)[] => {
	const existingSchemas = schemas.filter((x) => x.isExisting).map<Schema>((x) => ({
		type: 'schema',
		name: x.schemaName,
	}));
	const existingViews = views.map((x) => mssqlViewConfig(x)).filter((x) => x.isExisting).map<Table>((x) => ({
		type: 'table',
		schema: x.schema ?? 'public',
		name: x.name,
	}));

	return [...existingSchemas, ...existingViews];
};

export const extractMysqlExisting = (
	views: MySqlView[],
): Table[] => {
	const existingViews = views.map((x) => mysqlViewConfig(x)).filter((x) => x.isExisting).map<Table>((x) => ({
		type: 'table',
		schema: x.schema ?? 'public',
		name: x.name,
	}));

	return [...existingViews];
};

export const extractSqliteExisting = (
	views: SQLiteView[],
): Table[] => {
	const existingViews = views.map((x) => sqliteViewConfig(x)).filter((x) => x.isExisting).map<Table>((x) => ({
		type: 'table',
		schema: x.schema ?? 'public',
		name: x.name,
	}));

	return [...existingViews];
};

export const getColumnCasing = (
	column: { keyAsName: boolean; name: string | undefined },
	casing: CasingType | undefined,
) => {
	if (!column.name) return '';
	return !column.keyAsName || casing === undefined
		? column.name
		: casing === 'camelCase'
		? toCamelCase(column.name)
		: toSnakeCase(column.name);
};

export const sqlToStr = (sql: SQL, casing: CasingType | undefined) => {
	return sql.toQuery({
		escapeName: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		escapeParam: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		escapeString: () => {
			throw new Error("we don't support params for `sql` default values");
		},
		casing: new CasingCache(casing),
	}).sql;
};
