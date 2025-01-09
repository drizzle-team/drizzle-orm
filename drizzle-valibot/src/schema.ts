import { Column, getTableColumns, getViewSelectedFields, is, isTable, isView, SQL } from 'drizzle-orm';
import type { Table, View } from 'drizzle-orm';
import type { PgEnum } from 'drizzle-orm/pg-core';
import * as v from 'valibot';
import { columnToSchema, mapEnumValues } from './column.ts';
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
): v.GenericSchema {
	const columnSchemas: Record<string, v.GenericSchema> = {};

	for (const [key, selected] of Object.entries(columns)) {
		if (!is(selected, Column) && !is(selected, SQL) && !is(selected, SQL.Aliased) && typeof selected === 'object') {
			const columns = isTable(selected) || isView(selected) ? getColumns(selected) : selected;
			columnSchemas[key] = handleColumns(columns, refinements[key] ?? {}, conditions);
			continue;
		}

		const refinement = refinements[key];
		if (refinement !== undefined && typeof refinement !== 'function') {
			columnSchemas[key] = refinement;
			continue;
		}

		const column = is(selected, Column) ? selected : undefined;
		const schema = column ? columnToSchema(column) : v.any();
		const refined = typeof refinement === 'function' ? refinement(schema) : schema;

		if (conditions.never(column)) {
			continue;
		} else {
			columnSchemas[key] = refined;
		}

		if (column) {
			if (conditions.nullable(column)) {
				columnSchemas[key] = v.nullable(columnSchemas[key]!);
			}

			if (conditions.optional(column)) {
				columnSchemas[key] = v.optional(columnSchemas[key]!);
			}
		}
	}

	return v.object(columnSchemas) as any;
}

export const createSelectSchema: CreateSelectSchema = (
	entity: Table | View | PgEnum<[string, ...string[]]>,
	refine?: Record<string, any>,
) => {
	if (isPgEnum(entity)) {
		return v.enum(mapEnumValues(entity.enumValues));
	}
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, {
		never: () => false,
		optional: () => false,
		nullable: (column) => !column.notNull,
	}) as any;
};

export const createInsertSchema: CreateInsertSchema = (
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, {
		never: (column) => column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always',
		optional: (column) => !column.notNull || (column.notNull && column.hasDefault),
		nullable: (column) => !column.notNull,
	}) as any;
};

export const createUpdateSchema: CreateUpdateSchema = (
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, {
		never: (column) => column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always',
		optional: () => true,
		nullable: (column) => !column.notNull,
	}) as any;
};
