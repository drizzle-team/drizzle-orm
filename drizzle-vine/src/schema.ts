import vine from '@vinejs/vine';
import type { SchemaTypes } from '@vinejs/vine/types';
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
): ReturnType<typeof vine.object> {
	const columnSchemas: Record<string, SchemaTypes> = {};

	for (const [key, selected] of Object.entries(columns)) {
		if (!is(selected, Column) && !is(selected, SQL) && !is(selected, SQL.Aliased) && typeof selected === 'object') {
			const nestedColumns = isTable(selected) || isView(selected) ? getColumns(selected) : selected;
			columnSchemas[key] = handleColumns(nestedColumns, refinements[key] ?? {}, conditions);
			continue;
		}

		const refinement = refinements[key];
		if (refinement !== undefined && typeof refinement !== 'function') {
			columnSchemas[key] = refinement;
			continue;
		}

		const column = is(selected, Column) ? selected : undefined;
		const schema = column ? columnToSchema(column) : vine.any();
		const refined: SchemaTypes = typeof refinement === 'function' ? refinement(schema) : schema;

		if (conditions.never(column)) {
			continue;
		} else {
			columnSchemas[key] = refined;
		}

		if (column) {
			if (conditions.nullable(column)) {
				columnSchemas[key] = (columnSchemas[key] as any).nullable();
			}

			if (conditions.optional(column)) {
				columnSchemas[key] = (columnSchemas[key] as any).optional();
			}
		}
	}

	return vine.object(columnSchemas);
}

const selectConditions: Conditions = {
	never: () => false,
	optional: () => false,
	nullable: (column) => !column.notNull,
};

const insertConditions: Conditions = {
	never: (column) => column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always',
	optional: (column) => !column.notNull || (column.notNull && column.hasDefault),
	nullable: (column) => !column.notNull,
};

const updateConditions: Conditions = {
	never: (column) => column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always',
	optional: () => true,
	nullable: (column) => !column.notNull,
};

export const createSelectSchema: CreateSelectSchema = (
	entity: Table | View | PgEnum<[string, ...string[]]>,
	refine?: Record<string, any>,
) => {
	if (isPgEnum(entity)) {
		return vine.enum(entity.enumValues as [string, ...string[]]) as any;
	}
	const columns = getColumns(entity as Table | View);
	return handleColumns(columns, refine ?? {}, selectConditions) as any;
};

export const createInsertSchema: CreateInsertSchema = (
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, insertConditions) as any;
};

export const createUpdateSchema: CreateUpdateSchema = (
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, updateConditions) as any;
};
