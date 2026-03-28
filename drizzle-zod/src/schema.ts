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
	CreateTableSchemaOptions,
	CreateUpdateSchema,
	CreateViewSchemaOptions,
	SchemaType,
} from './schema.types.ts';
import { isPgEnum } from './utils.ts';

const conditionsMap: Record<SchemaType, Conditions> = {
	select: {
		never: () => false,
		optional: () => false,
		nullable: (column) => !column.notNull,
	},
	insert: {
		never: (column) => column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always',
		optional: (column) => !column.notNull || (column.notNull && column.hasDefault),
		nullable: (column) => !column.notNull,
	},
	update: {
		never: (column) => column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always',
		optional: () => true,
		nullable: (column) => !column.notNull,
	},
};

function getColumns(tableLike: Table | View) {
	return isTable(tableLike) ? getTableColumns(tableLike) : getViewSelectedFields(tableLike);
}

function filterColumns(
	columns: Record<string, any>,
	options?: { pick?: string[]; omit?: string[] },
): Record<string, any> {
	if (!options) return columns;

	const hasPick = options.pick && options.pick.length > 0;
	const hasOmit = options.omit && options.omit.length > 0;

	if (hasPick && hasOmit) {
		throw new Error('Cannot use both "pick" and "omit" options together. Use one or the other.');
	}

	if (hasPick) {
		const picked: Record<string, any> = {};
		for (const key of options.pick!) {
			if (key in columns) {
				picked[key] = columns[key];
			}
		}
		return picked;
	}

	if (hasOmit) {
		const result: Record<string, any> = {};
		const omitSet = new Set(options.omit!);
		for (const [key, value] of Object.entries(columns)) {
			if (!omitSet.has(key)) {
				result[key] = value;
			}
		}
		return result;
	}

	return columns;
}

interface SchemaLevelOptions {
	allOptional?: boolean;
	allNullable?: boolean;
}

function handleColumns(
	columns: Record<string, any>,
	refinements: Record<string, any>,
	conditions: Conditions,
	factory?: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>,
	schemaOptions?: SchemaLevelOptions,
): z.ZodType {
	const columnSchemas: Record<string, z.ZodType> = {};

	for (const [key, selected] of Object.entries(columns)) {
		if (!is(selected, Column) && !is(selected, SQL) && !is(selected, SQL.Aliased) && typeof selected === 'object') {
			const columns = isTable(selected) || isView(selected) ? getColumns(selected) : selected;
			columnSchemas[key] = handleColumns(columns, refinements[key] ?? {}, conditions, factory, schemaOptions);
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

		const shouldBeNullable = schemaOptions?.allNullable || (column && conditions.nullable(column));
		if (shouldBeNullable) {
			columnSchemas[key] = columnSchemas[key]!.nullable();
		}

		const shouldBeOptional = schemaOptions?.allOptional || (column && conditions.optional(column));
		if (shouldBeOptional) {
			columnSchemas[key] = columnSchemas[key]!.optional();
		}
	}

	return z.object(columnSchemas) as any;
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
	return handleColumns(columns, refine ?? {}, selectConditions) as any;
};

export const createInsertSchema: CreateInsertSchema<undefined> = (
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, insertConditions) as any;
};

export const createUpdateSchema: CreateUpdateSchema<undefined> = (
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, updateConditions) as any;
};

export function createSchemaFactory<
	TCoerce extends Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined,
>(options?: CreateSchemaFactoryOptions<TCoerce>) {
	const createSelectSchema: CreateSelectSchema<TCoerce> = (
		entity: Table | View | PgEnum<[string, ...string[]]>,
		refine?: Record<string, any>,
	) => {
		if (isPgEnum(entity)) {
			return handleEnum(entity, options);
		}
		const columns = getColumns(entity);
		return handleColumns(columns, refine ?? {}, selectConditions, options) as any;
	};

	const createInsertSchema: CreateInsertSchema<TCoerce> = (
		entity: Table,
		refine?: Record<string, any>,
	) => {
		const columns = getColumns(entity);
		return handleColumns(columns, refine ?? {}, insertConditions, options) as any;
	};

	const createUpdateSchema: CreateUpdateSchema<TCoerce> = (
		entity: Table,
		refine?: Record<string, any>,
	) => {
		const columns = getColumns(entity);
		return handleColumns(columns, refine ?? {}, updateConditions, options) as any;
	};

	function createSchema<TTable extends Table>(
		table: TTable,
		schemaOptions: CreateTableSchemaOptions<TTable, TCoerce>,
	): z.ZodObject<z.ZodRawShape>;
	function createSchema<TView extends View>(
		view: TView,
		schemaOptions?: CreateViewSchemaOptions<TView, TCoerce>,
	): z.ZodObject<z.ZodRawShape>;
	function createSchema<TEnum extends PgEnum<any>>(
		enum_: TEnum,
	): z.ZodEnum<{ [K in TEnum['enumValues'][number]]: K }>;
	function createSchema(
		entity: Table | View | PgEnum<[string, ...string[]]>,
		schemaOptions?: CreateTableSchemaOptions<any, TCoerce> | CreateViewSchemaOptions<any, TCoerce>,
	): z.ZodType {
		if (isPgEnum(entity)) {
			return handleEnum(entity, options);
		}

		const type = schemaOptions?.type ?? 'select';
		const conditions = conditionsMap[type];
		let columns = getColumns(entity);

		columns = filterColumns(columns, {
			pick: (schemaOptions as any)?.pick as string[] | undefined,
			omit: (schemaOptions as any)?.omit as string[] | undefined,
		});

		return handleColumns(columns, schemaOptions?.refine ?? {}, conditions, options, {
			allOptional: schemaOptions?.allOptional,
			allNullable: schemaOptions?.allNullable,
		}) as any;
	}

	return { createSelectSchema, createInsertSchema, createUpdateSchema, createSchema };
}
