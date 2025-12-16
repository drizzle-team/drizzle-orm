import { Column, getTableColumns, getViewSelectedFields, is, isTable, isView, SQL } from 'drizzle-orm';
import type { Table, View } from 'drizzle-orm';
import type { PgEnum } from 'drizzle-orm/pg-core';
import { z } from 'zod/v4';
import { columnToSchema } from './column.ts';
import type { Conditions } from './schema.types.internal.ts';
import type {
	CreateInsertSchema,
	CreateSchemaFactoryOptions,
	CreateSelectSchema,
	CreateUpdateSchema,
	SchemaMode,
} from './schema.types.ts';
import { isPgEnum } from './utils.ts';

/** Secure defaults for createSchemaFactory - prevents common security issues */
const SECURE_DEFAULTS = {
	mode: 'strict' as const,
	trim: true,
	defaultTextMaxLength: 65535,
};

function getColumns(tableLike: Table | View) {
	return isTable(tableLike) ? getTableColumns(tableLike) : getViewSelectedFields(tableLike);
}

function applySchemaMode(schema: z.ZodObject<any>, mode: SchemaMode | undefined): z.ZodType {
	switch (mode) {
		case 'strict':
			return schema.strict();
		case 'passthrough':
			return schema.passthrough();
		case 'strip':
		default:
			return schema.strip();
	}
}

function handleColumns(
	columns: Record<string, any>,
	refinements: Record<string, any>,
	conditions: Conditions,
	factory?: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>,
	isTopLevel = false,
): z.ZodType {
	const columnSchemas: Record<string, z.ZodType> = {};

	for (const [key, selected] of Object.entries(columns)) {
		if (!is(selected, Column) && !is(selected, SQL) && !is(selected, SQL.Aliased) && typeof selected === 'object') {
			const columns = isTable(selected) || isView(selected) ? getColumns(selected) : selected;
			columnSchemas[key] = handleColumns(columns, refinements[key] ?? {}, conditions, factory, false);
			continue;
		}

		const refinement = refinements[key];
		if (refinement !== undefined && typeof refinement !== 'function') {
			columnSchemas[key] = refinement;
			continue;
		}

		const column = is(selected, Column) ? selected : undefined;
		const schema = column ? columnToSchema(column, factory) : z.any();
		const refined = typeof refinement === 'function' ? refinement(schema) : schema;

		if (conditions.never(column)) {
			continue;
		} else {
			columnSchemas[key] = refined;
		}

		if (column) {
			if (conditions.nullable(column)) {
				columnSchemas[key] = columnSchemas[key]!.nullable();
			}

			if (conditions.optional(column)) {
				columnSchemas[key] = columnSchemas[key]!.optional();
			}
		}
	}

	const objectSchema = z.object(columnSchemas);
	// Apply mode only at top level to avoid nested strict/strip issues
	return isTopLevel ? applySchemaMode(objectSchema, factory?.mode) : objectSchema;
}

function handleEnum(
	enum_: PgEnum<any>,
	factory?: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>,
) {
	const zod: typeof z = factory?.zodInstance ?? z;
	return zod.enum(enum_.enumValues);
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

export const createSelectSchema: CreateSelectSchema<undefined> = (
	entity: Table | View | PgEnum<[string, ...string[]]>,
	refine?: Record<string, any>,
) => {
	if (isPgEnum(entity)) {
		return handleEnum(entity);
	}
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, selectConditions, undefined, true) as any;
};

export const createInsertSchema: CreateInsertSchema<undefined> = (
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, insertConditions, undefined, true) as any;
};

export const createUpdateSchema: CreateUpdateSchema<undefined> = (
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, updateConditions, undefined, true) as any;
};

export function createSchemaFactory<
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
>(options?: CreateSchemaFactoryOptions<TCoerce>) {
	// Merge secure defaults with user options (user options take precedence)
	const secureOptions = { ...SECURE_DEFAULTS, ...options } as CreateSchemaFactoryOptions<TCoerce>;

	const createSelectSchema: CreateSelectSchema<TCoerce> = (
		entity: Table | View | PgEnum<[string, ...string[]]>,
		refine?: Record<string, any>,
	) => {
		if (isPgEnum(entity)) {
			return handleEnum(entity, secureOptions);
		}
		const columns = getColumns(entity);
		return handleColumns(columns, refine ?? {}, selectConditions, secureOptions, true) as any;
	};

	const createInsertSchema: CreateInsertSchema<TCoerce> = (
		entity: Table,
		refine?: Record<string, any>,
	) => {
		const columns = getColumns(entity);
		return handleColumns(columns, refine ?? {}, insertConditions, secureOptions, true) as any;
	};

	const createUpdateSchema: CreateUpdateSchema<TCoerce> = (
		entity: Table,
		refine?: Record<string, any>,
	) => {
		const columns = getColumns(entity);
		return handleColumns(columns, refine ?? {}, updateConditions, secureOptions, true) as any;
	};

	return { createSelectSchema, createInsertSchema, createUpdateSchema };
}
