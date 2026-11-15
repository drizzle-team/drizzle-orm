import { Column, getTableColumns, getViewSelectedFields, is, isTable, isView, SQL } from 'drizzle-orm';
import type { Table, View } from 'drizzle-orm';
import type { PgDomainColumn, PgEnum } from 'drizzle-orm/pg-core';
import { getTableConfig, PgDialect, PgTable } from 'drizzle-orm/pg-core';
import { z } from 'zod/v4';
import { pgCheckNames } from './check-names.ts';
import { applyCheckParts, type CheckColumn, type Expr, type ObjectCheckRule, tableCheckRules } from './checks.ts';
import { checkColumnKind, columnToSchema } from './column.ts';
import type { Conditions } from './schema.types.internal.ts';
import type {
	CreateInsertSchema,
	CreateSchemaFactoryOptions,
	CreateSelectSchema,
	CreateUpdateSchema,
} from './schema.types.ts';
import { isColumnType, isPgEnum } from './utils.ts';

function getColumns(tableLike: Table | View) {
	return isTable(tableLike) ? getTableColumns(tableLike) : getViewSelectedFields(tableLike);
}

const pgDialect = new PgDialect();

// 'startsAt' -> 'starts at', for default messages that name another column
const humanize = (key: string) => key.replace(/_/g, ' ').replace(/([\da-z])([A-Z])/g, '$1 $2').toLowerCase().trim();

type TableChecks = { fields: Map<string, { name: string; parts: Expr[] }[]>; objects: ObjectCheckRule[] };

// table-level CHECKs (pg): parts that read one column refine that field, the rest refine the object
function tableChecks(table: Table | View, columns: Record<string, any>): TableChecks {
	const result: TableChecks = { fields: new Map(), objects: [] };
	if (!is(table, PgTable)) return result;
	const checks = getTableConfig(table).checks;
	if (checks.length === 0) return result;
	const cols: CheckColumn[] = [];
	for (const [key, col] of Object.entries(columns)) {
		if (is(col, Column)) cols.push({ key, name: col.name, kind: checkColumnKind(col) });
	}
	const names = pgCheckNames(table);
	for (const [i, check] of checks.entries()) {
		const name = names.table[i]!;
		const sql = pgDialect.sqlToQuery(check.value).sql;
		const { fields, objects } = tableCheckRules(sql, name, cols, humanize);
		for (const [key, parts] of fields) {
			result.fields.set(key, [...(result.fields.get(key) ?? []), { name, parts }]);
		}
		result.objects.push(...objects);
	}
	return result;
}

// Object-level refinements make zod's .pick()/.omit()/.partial() throw, unless zod keeps refinements that declare
// the keys they read (`keys`). Checks across columns are only added when it does; the database still enforces them.
let keyedRefinements: boolean | undefined;
function supportsKeyedRefinements(): boolean {
	if (keyedRefinements === undefined) {
		try {
			const probe = z.object({ a: z.any(), b: z.any() }).refine(() => false, { keys: ['a'] } as any);
			keyedRefinements = probe.omit({ b: true }).safeParse({ a: 1 }).success === false
				&& probe.omit({ a: true }).safeParse({ b: 1 }).success;
		} catch {
			keyedRefinements = false;
		}
	}
	return keyedRefinements;
}

function handleColumns(
	columns: Record<string, any>,
	refinements: Record<string, any>,
	conditions: Conditions,
	factory?: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>,
	table?: Table | View,
): z.ZodType {
	const columnSchemas: Record<string, z.ZodType> = {};
	const checks: TableChecks = table ? tableChecks(table, columns) : { fields: new Map(), objects: [] };

	for (const [key, selected] of Object.entries(columns)) {
		if (!is(selected, Column) && !is(selected, SQL) && !is(selected, SQL.Aliased) && typeof selected === 'object') {
			const columns = isTable(selected) || isView(selected) ? getColumns(selected) : selected;
			columnSchemas[key] = handleColumns(columns, refinements[key] ?? {}, conditions, factory);
			continue;
		}

		const refinement = refinements[key];
		if (refinement !== undefined && typeof refinement !== 'function') {
			columnSchemas[key] = refinement;
			continue;
		}

		const column = is(selected, Column) ? selected : undefined;
		let schema = column ? columnToSchema(column, factory) : z.any();
		if (column) {
			for (const { name, parts } of checks.fields.get(key) ?? []) {
				schema = applyCheckParts(schema, parts, name, checkColumnKind(column));
			}
		}
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

	let object: any = z.object(columnSchemas);
	for (const rule of supportsKeyedRefinements() ? checks.objects : []) {
		// a column left out of the schema (e.g. generated) can't be checked here; the database still does
		if (rule.keys.some((k) => !(k in columnSchemas))) continue;
		object = object.refine((v: Record<string, unknown>) => rule.test(v), {
			name: rule.name,
			message: rule.message,
			path: [rule.path],
			// lets pick/omit/partial/extend keep the rule (the zod fork's keyed refinements)
			keys: rule.keys,
			// run once the columns it reads are valid, even if other fields have issues
			when: (payload: any) =>
				typeof payload.value === 'object' && payload.value !== null
				&& !payload.issues.some((i: any) => rule.keys.includes(i.path?.[0])),
		});
	}
	return object;
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

function isNullable(column: Column) {
	if (isColumnType<PgDomainColumn<any, any>>(column, ['PgDomainColumn'])) {
		// if either the wrapped column or the column instance is nullable, nullable is true
		return !column.domain.notNull && !column.notNull;
	}

	return !column.notNull;
}

const selectConditions: Conditions = {
	never: () => false,
	optional: () => false,
	nullable: (column) => isNullable(column),
};

const insertConditions: Conditions = {
	never: (column) => column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always',
	optional: (column) => {
		if (isColumnType<PgDomainColumn<any, any>>(column, ['PgDomainColumn'])) {
			// handle both the underlying column and the column itself
			return (column.domain.hasDefault || column.hasDefault)
				|| (!column.domain.notNull && !column.notNull);
		}

		return !column.notNull || column.hasDefault;
	},
	nullable: (column) => isNullable(column),
};

const updateConditions: Conditions = {
	never: (column) => column?.generated?.type === 'always' || column?.generatedIdentity?.type === 'always',
	optional: () => true,
	nullable: (column) => isNullable(column),
};

export const createSelectSchema: CreateSelectSchema<undefined> = (
	entity: Table | View | PgEnum<[string, ...string[]]>,
	refine?: Record<string, any>,
) => {
	if (isPgEnum(entity)) {
		return handleEnum(entity);
	}
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, selectConditions, undefined, entity) as any;
};

export const createInsertSchema: CreateInsertSchema<undefined> = (
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, insertConditions, undefined, entity) as any;
};

export const createUpdateSchema: CreateUpdateSchema<undefined> = (
	entity: Table,
	refine?: Record<string, any>,
) => {
	const columns = getColumns(entity);
	return handleColumns(columns, refine ?? {}, updateConditions, undefined, entity) as any;
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
		return handleColumns(columns, refine ?? {}, selectConditions, options, entity) as any;
	};

	const createInsertSchema: CreateInsertSchema<TCoerce> = (
		entity: Table,
		refine?: Record<string, any>,
	) => {
		const columns = getColumns(entity);
		return handleColumns(columns, refine ?? {}, insertConditions, options, entity) as any;
	};

	const createUpdateSchema: CreateUpdateSchema<TCoerce> = (
		entity: Table,
		refine?: Record<string, any>,
	) => {
		const columns = getColumns(entity);
		return handleColumns(columns, refine ?? {}, updateConditions, options, entity) as any;
	};

	return { createSelectSchema, createInsertSchema, createUpdateSchema };
}
