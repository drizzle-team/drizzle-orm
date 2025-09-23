import { type Type, type } from 'arktype';
import { Column, getTableColumns, getViewSelectedFields, is, isTable, isView, SQL } from 'drizzle-orm';
import type { Table, View } from 'drizzle-orm';
import type { PgEnum } from 'drizzle-orm/pg-core';
import { columnToSchema } from './column.ts';
import type { Conditions } from './schema.types.internal.ts';
import type { CreateInsertSchema, CreateSelectSchema, CreateUpdateSchema } from './schema.types.ts';
import { isPgEnum } from './utils.ts';

function getColumns(tableLike: Table | View) {
	return isTable(tableLike) ? getTableColumns(tableLike) : getViewSelectedFields(tableLike);
}

function handleColumns(
	columns: Record<string, any>,
	refinements: Record<string, any>,
	conditions: Conditions,
): Type {
	const columnSchemas: Record<string, Type> = {};

	for (const [key, selected] of Object.entries(columns)) {
		if (!is(selected, Column) && !is(selected, SQL) && !is(selected, SQL.Aliased) && typeof selected === 'object') {
			const columns = isTable(selected) || isView(selected) ? getColumns(selected) : selected;
			columnSchemas[key] = handleColumns(columns, refinements[key] ?? {}, conditions);
			continue;
		}

		const refinement = refinements[key];
		if (
			refinement !== undefined
			&& (typeof refinement !== 'function' || (typeof refinement === 'function' && refinement.expression !== undefined))
		) {
			columnSchemas[key] = refinement;
			continue;
		}

		const column = is(selected, Column) ? selected : undefined;
		const schema = column ? columnToSchema(column) : type.unknown;
		const refined = typeof refinement === 'function' ? refinement(schema) : schema;

		if (conditions.never(column)) {
			continue;
		} else {
			columnSchemas[key] = refined;
		}

		if (column) {
			if (conditions.nullable(column)) {
				columnSchemas[key] = columnSchemas[key]!.or(type.null);
			}

			if (conditions.optional(column)) {
				columnSchemas[key] = columnSchemas[key]!.optional() as any;
			}
		}
	}

	return type(columnSchemas);
}

export const createSelectSchema = ((
	entity: Table | View | PgEnum<[string, ...string[]]>,
	refine?: Record<string, any>,
) => {
	if (isPgEnum(entity)) {
		return type.enumerated(...entity.enumValues);
	}
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, {
		never: () => false,
		optional: () => false,
		nullable: (column) => !column.notNull,
	}) as any;
}) as CreateSelectSchema;

export const createInsertSchema = ((
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, {
		never: (column) =>
			column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always'
			|| ('identity' in (column ?? {}) && typeof (column as any)?.identity !== 'undefined'),
		optional: (column) => !column.notNull || (column.notNull && column.hasDefault),
		nullable: (column) => !column.notNull,
	}) as any;
}) as CreateInsertSchema;

export const createUpdateSchema = ((
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, {
		never: (column) =>
			column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always'
			|| ('identity' in (column ?? {}) && typeof (column as any)?.identity !== 'undefined'),
		optional: () => true,
		nullable: (column) => !column.notNull,
	}) as any;
}) as CreateUpdateSchema;
