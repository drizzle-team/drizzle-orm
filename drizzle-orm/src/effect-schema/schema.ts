import { Schema as s } from 'effect';
import type { Top as SchemaTop } from 'effect/Schema';
import { Column } from '~/column.ts';
import { is } from '~/entity.ts';
import type { PgEnum } from '~/pg-core/columns/enum.ts';
import { isView, SQL, type View } from '~/sql/sql.ts';
import { isTable, type Table } from '~/table.ts';
import { getColumns } from '~/utils.ts';
import { isWithEnum } from '../utils.ts';
import { columnToSchema } from './column.ts';
import type { Conditions } from './schema.types.internal.ts';
import type { CreateInsertSchema, CreateSelectSchema, CreateUpdateSchema } from './schema.types.ts';

function isOptional(schema: unknown): schema is s.optional<SchemaTop> {
	if ((typeof schema !== 'object' || schema === null) && typeof schema !== 'function') return false;

	return 'schema' in schema && s.isSchema((schema as any).schema);
}

function isStructField(schema: unknown): schema is s.optional<SchemaTop> | SchemaTop {
	if (s.isSchema(schema)) return true;

	return isOptional(schema);
}

function handleColumns(
	columns: Record<string, any>,
	refinements: Record<string, any>,
	conditions: Conditions,
): SchemaTop {
	const columnSchemas: Record<string, SchemaTop | s.optional<SchemaTop>> = {};
	for (const [key, selected] of Object.entries(columns)) {
		if (!is(selected, Column) && !is(selected, SQL) && !is(selected, SQL.Aliased) && typeof selected === 'object') {
			const columns = isTable(selected) || isView(selected) ? getColumns(selected) : selected;
			columnSchemas[key] = handleColumns(columns, refinements[key] ?? {}, conditions);
			continue;
		}

		const refinement = refinements[key];

		if (refinement !== undefined && !(typeof refinement === 'function' && !isStructField(refinement))) {
			columnSchemas[key] = refinement;
			continue;
		}

		const column = is(selected, Column) ? selected : undefined;
		const schema = column ? columnToSchema(column) : s.Any;
		const _refined = isStructField(refinement) || typeof refinement !== 'function' ? schema : refinement(schema);
		const refined = isOptional(_refined) ? (_refined as any).schema : _refined as SchemaTop;

		if (conditions.never(column)) {
			continue;
		} else {
			columnSchemas[key] = refined;
		}

		if (column) {
			if (conditions.nullable(column)) {
				columnSchemas[key] = s.NullOr(columnSchemas[key] as SchemaTop);
			}

			if (conditions.optional(column)) {
				columnSchemas[key] = s.optional(s.UndefinedOr(columnSchemas[key] as SchemaTop));
			}
		}
	}

	return s.Struct(columnSchemas);
}

function handleEnum(
	enum_: PgEnum<[string, ...string[]]>,
) {
	return s.Literals(enum_.enumValues);
}

const selectConditions: Conditions = {
	never: () => false,
	optional: () => false,
	nullable: (column) => !column.notNull,
};

const insertConditions: Conditions = {
	never: (column) =>
		column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always'
		|| ('identity' in (column ?? {}) && typeof (column as any)?.identity !== 'undefined'),
	optional: (column) => !column.notNull || (column.notNull && column.hasDefault),
	nullable: (column) => !column.notNull,
};

const updateConditions: Conditions = {
	never: (column) =>
		column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always'
		|| ('identity' in (column ?? {}) && typeof (column as any)?.identity !== 'undefined'),
	optional: () => true,
	nullable: (column) => !column.notNull,
};

export const createSelectSchema: CreateSelectSchema = (
	entity: Table | View | PgEnum<[string, ...string[]]>,
	refine?: Record<string, any>,
) => {
	if (isWithEnum(entity)) {
		return handleEnum(entity);
	}
	const columns = getColumns(entity);
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
