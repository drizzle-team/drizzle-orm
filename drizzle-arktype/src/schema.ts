import { Type, type } from 'arktype';
import { Column, getTableColumns, getViewSelectedFields, is, isTable, isView, SQL } from 'drizzle-orm';
import type { Table, View } from 'drizzle-orm';
import type { PgEnum } from 'drizzle-orm/pg-core';
import { columnToSchema } from './column.ts';
import type { Conditions } from './schema.types.internal.ts';
import type { CreateInsertSchema, CreateSelectSchema, CreateUpdateSchema } from './schema.types.ts';
import { isPgEnum } from './utils.ts';
import { SchemaValidationError } from './errors.ts';

function getColumns(tableLike: Table | View) {
	return isTable(tableLike) ? getTableColumns(tableLike) : getViewSelectedFields(tableLike);
}

function validateSchema(
	schema: Record<string, Type>,
	refinements: Record<string, any>,
	conditions: Conditions,
): Record<string, Type> {
	const errors: Record<string, string> = {};
	const validatedSchemas: Record<string, Type> = {};

	for (const [key, selected] of Object.entries(schema)) {
		if (!is(selected, Column) && !is(selected, SQL) && !is(selected, SQL.Aliased) && typeof selected === 'object') {
			const columns = isTable(selected) || isView(selected) ? getColumns(selected) : selected;
			try {
				validatedSchemas[key] = validateSchema(columns, refinements[key] ?? {}, conditions);
			} catch (error) {
				throw new SchemaValidationError(
					key,
					{ _: `Failed to validate nested schema: ${error instanceof Error ? error.message : String(error)}` },
				);
			}
			continue;
		}

		const refinement = refinements[key];
		if (
			refinement !== undefined
			&& (typeof refinement !== 'function' || (typeof refinement === 'function' && refinement.expression !== undefined))
		) {
			validatedSchemas[key] = refinement;
			continue;
		}

		const column = is(selected, Column) ? selected : undefined;
		let columnSchema;

		try {
			columnSchema = column ? columnToSchema(column) : type.unknown;
		} catch (error) {
			throw new SchemaValidationError(
				key,
				{ [key]: `Failed to convert column schema: ${error instanceof Error ? error.message : String(error)}` },
			);
		}

		const refined = typeof refinement === 'function' ? refinement(columnSchema) : columnSchema;

		if (conditions.never(column)) {
			continue;
		} else {
			validatedSchemas[key] = refined;
		}

		if (column) {
			if (conditions.nullable(column)) {
				validatedSchemas[key] = validatedSchemas[key]!.or(type.null);
			}

			if (conditions.optional(column)) {
				validatedSchemas[key] = validatedSchemas[key]!.optional() as any;
			}
		}
	}

	if (Object.keys(errors).length > 0) {
		throw new SchemaValidationError('schema', errors);
	}

	return validatedSchemas;
}

export const createSelectSchema = ((
	entity: Table | View | PgEnum<[string, string[]]>,
	refine?: Record<string, any>,
) => {
	if (isPgEnum(entity)) {
		return type.enumerated(...entity.enumValues);
	}
	const columns = getColumns(entity);
	return validateSchema(columns, refine ?? {}, {
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
	return validateSchema(columns, refine ?? {}, {
		never: (column) => column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always',
		optional: (column) => !column.notNull || (column.notNull && column.hasDefault),
		nullable: (column) => !column.notNull,
	}) as any;
}) as CreateInsertSchema;

export const createUpdateSchema = ((
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return validateSchema(columns, refine ?? {}, {
		never: (column) => column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always',
		optional: () => true,
		nullable: (column) => !column.notNull,
	}) as any;
}) as CreateUpdateSchema;