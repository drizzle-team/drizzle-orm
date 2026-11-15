import type { Column, ColumnBaseConfig } from 'drizzle-orm';
import { getTableName } from 'drizzle-orm';
import type {
	MySqlBigInt53,
	MySqlChar,
	MySqlDouble,
	MySqlFloat,
	MySqlInt,
	MySqlMediumInt,
	MySqlReal,
	MySqlSerial,
	MySqlSmallInt,
	MySqlText,
	MySqlTinyInt,
	MySqlVarChar,
	MySqlYear,
} from 'drizzle-orm/mysql-core';
import type {
	CheckBuilder,
	PgArray,
	PgBigInt53,
	PgBigSerial53,
	PgBinaryVector,
	PgChar,
	PgDomainColumn,
	PgDoublePrecision,
	PgGeometry,
	PgGeometryObject,
	PgHalfVector,
	PgInteger,
	PgLineABC,
	PgLineTuple,
	PgPointObject,
	PgPointTuple,
	PgReal,
	PgSerial,
	PgSmallInt,
	PgSmallSerial,
	PgUUID,
	PgVarchar,
	PgVector,
} from 'drizzle-orm/pg-core';
import { PgDialect } from 'drizzle-orm/pg-core';
import { pgCheckNames } from './check-names.ts';
import { applyCheckConstraint, type ColumnKind } from './checks.ts';

const pgDialect = new PgDialect();
import type {
	SingleStoreBigInt53,
	SingleStoreChar,
	SingleStoreDouble,
	SingleStoreFloat,
	SingleStoreInt,
	SingleStoreMediumInt,
	SingleStoreReal,
	SingleStoreSerial,
	SingleStoreSmallInt,
	SingleStoreText,
	SingleStoreTinyInt,
	SingleStoreVarChar,
	SingleStoreYear,
} from 'drizzle-orm/singlestore-core';
import type { SQLiteInteger, SQLiteReal, SQLiteText } from 'drizzle-orm/sqlite-core';
import { z as zod } from 'zod/v4';
import { CONSTANTS } from './constants.ts';
import type { CreateSchemaFactoryOptions } from './schema.types.ts';
import { isColumnType, isWithEnum } from './utils.ts';
import type { Json } from './utils.ts';

export const literalSchema = zod.union([zod.string(), zod.number(), zod.boolean(), zod.null()]);
export const jsonSchema: zod.ZodType<Json> = zod.union([
	literalSchema,
	zod.record(zod.string(), zod.any()),
	zod.array(zod.any()),
]);
export const bufferSchema: zod.ZodType<Buffer> = zod.custom<Buffer>((v) => v instanceof Buffer); // eslint-disable-line no-instanceof/no-instanceof

export function columnToSchema(
	column: Column,
	factory:
		| CreateSchemaFactoryOptions<
			Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
		>
		| undefined,
): zod.ZodType {
	const z: typeof zod = factory?.zodInstance ?? zod;
	const coerce = factory?.coerce ?? {};
	let schema!: zod.ZodType;

	if (isWithEnum(column)) {
		schema = column.enumValues.length ? z.enum(column.enumValues) : z.string();
	}

	if (!schema) {
		// Handle specific types
		if (isColumnType<PgGeometry<any> | PgPointTuple<any>>(column, ['PgGeometry', 'PgPointTuple'])) {
			schema = z.tuple([z.number(), z.number()]);
		} else if (
			isColumnType<PgPointObject<any> | PgGeometryObject<any>>(column, ['PgGeometryObject', 'PgPointObject'])
		) {
			schema = z.object({ x: z.number(), y: z.number() });
		} else if (isColumnType<PgHalfVector<any> | PgVector<any>>(column, ['PgHalfVector', 'PgVector'])) {
			schema = z.array(z.number());
			schema = column.dimensions ? (schema as zod.ZodArray<any>).length(column.dimensions) : schema;
		} else if (isColumnType<PgLineTuple<any>>(column, ['PgLine'])) {
			schema = z.tuple([z.number(), z.number(), z.number()]);
		} else if (isColumnType<PgLineABC<any>>(column, ['PgLineABC'])) {
			schema = z.object({
				a: z.number(),
				b: z.number(),
				c: z.number(),
			});
		} // Handle other types
		else if (isColumnType<PgArray<any, any>>(column, ['PgArray'])) {
			schema = z.array(columnToSchema(column.baseColumn, factory));
			schema = column.size ? (schema as zod.ZodArray<any>).length(column.size) : schema;
		} else if (column.dataType === 'array') {
			schema = z.array(z.any());
		} else if (column.dataType === 'number') {
			schema = numberColumnToSchema(column, z, coerce);
		} else if (column.dataType === 'bigint') {
			schema = bigintColumnToSchema(column, z, coerce);
		} else if (column.dataType === 'boolean') {
			schema = coerce === true || coerce.boolean ? z.coerce.boolean() : z.boolean();
		} else if (column.dataType === 'date') {
			schema = coerce === true || coerce.date ? z.coerce.date() : z.date();
		} else if (column.dataType === 'string') {
			schema = stringColumnToSchema(column, z, coerce);
		} else if (column.dataType === 'json') {
			schema = jsonSchema;
		} else if (column.dataType === 'custom') {
			schema = z.any();
		} else if (column.dataType === 'buffer') {
			schema = bufferSchema;
		}
	}

	if (!schema) {
		schema = z.any();
	}

	// refine with what the CHECK constraints guarantee, exactly as postgres evaluates them. for domain
	// columns the domain's own checks (written against VALUE) apply too, plus any checks on the column itself
	const isDomain = isColumnType<PgDomainColumn<any, any>>(column, ['PgDomainColumn']);
	const kind = checkColumnKind(column);
	const sources: { checks: CheckBuilder[] | undefined; ref: string; base: string }[] = [
		{ checks: column.checkConstraints, ref: column.name, base: `${getTableName(column.table)}_${column.name}` },
	];
	if (isDomain) {
		const domainColumn = column as PgDomainColumn<any, any>;
		sources.push({ checks: domainColumn.domainCheckConstraints, ref: 'VALUE', base: domainColumn.domainName });
	}
	// unnamed checks get the same names drizzle-kit gives them in the database: <base>_check, <base>_check1, ...
	const tableNames = column.table ? pgCheckNames(column.table) : undefined;
	for (const { checks, ref, base } of sources) {
		const taken = new Set((checks ?? []).map((c) => c.name).filter(Boolean) as string[]);
		for (const checkConstraint of checks ?? []) {
			let name = checkConstraint.name ?? (ref === 'VALUE' ? undefined : tableNames?.column.get(checkConstraint));
			if (!name) {
				name = `${base}_check`;
				for (let i = 1; taken.has(name); i++) name = `${base}_check${i}`;
				taken.add(name);
			}
			const checkSql = pgDialect.sqlToQuery(checkConstraint.value).sql;
			schema = applyCheckConstraint(schema, checkSql, ref, name, kind);
		}
	}

	return schema;
}

/** How postgres compares this column's values in a CHECK expression (a domain column: its base type). */
export function checkColumnKind(column: Column): ColumnKind {
	const base: Column = isColumnType<PgDomainColumn<any, any>>(column, ['PgDomainColumn'])
		? (column as PgDomainColumn<any, any>).domain
		: column;
	if (base.columnType === 'PgEnumColumn' || base.columnType === 'PgEnumObjectColumn') return { t: 'enum' };
	const sqlType = base.getSQLType().toLowerCase().trim();
	if (/^(?:text|varchar|character varying)(?:\s*\(\d+\))?$/.test(sqlType)) return { t: 'string' };
	if (/^(?:smallint|integer|int|int2|int4|serial|smallserial)$/.test(sqlType)) return { t: 'number' };
	if (/^(?:bigint|int8|bigserial)$/.test(sqlType)) {
		return base.dataType === 'bigint'
			? { t: 'bigint' }
			: { t: 'number' };
	}
	if (sqlType === 'real') return { t: 'number', float: 'real' };
	if (sqlType === 'double precision') return { t: 'number', float: 'double' };
	const numeric = /^(?:numeric|decimal)(?:\s*\(\s*\d+\s*(?:,\s*(\d+)\s*)?\))?$/.exec(sqlType);
	if (numeric) {
		const scale = numeric[1] === undefined ? sqlType.includes('(') ? 0 : undefined : Number(numeric[1]);
		return { t: 'numeric', scale };
	}
	if (sqlType === 'date') return { t: 'time', zone: 'day' };
	const ts = /^timestamp(?:\s*\((\d)\))?(\s+with time zone)?$/.exec(sqlType);
	if (ts) return { t: 'time', zone: ts[2] ? 'tstz' : 'ts', precision: ts[1] === undefined ? undefined : Number(ts[1]) };
	return { t: 'other' };
}

function numberColumnToSchema(
	column: Column,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>['coerce'],
): zod.ZodType {
	let unsigned = column.getSQLType().includes('unsigned');
	let min!: number;
	let max!: number;
	let integer = false;

	if (isColumnType<MySqlTinyInt<any> | SingleStoreTinyInt<any>>(column, ['MySqlTinyInt', 'SingleStoreTinyInt'])) {
		min = unsigned ? 0 : CONSTANTS.INT8_MIN;
		max = unsigned ? CONSTANTS.INT8_UNSIGNED_MAX : CONSTANTS.INT8_MAX;
		integer = true;
	} else if (
		isColumnType<PgSmallInt<any> | PgSmallSerial<any> | MySqlSmallInt<any> | SingleStoreSmallInt<any>>(column, [
			'PgSmallInt',
			'PgSmallSerial',
			'MySqlSmallInt',
			'SingleStoreSmallInt',
		])
	) {
		min = unsigned ? 0 : CONSTANTS.INT16_MIN;
		max = unsigned ? CONSTANTS.INT16_UNSIGNED_MAX : CONSTANTS.INT16_MAX;
		integer = true;
	} else if (
		isColumnType<
			PgReal<any> | MySqlFloat<any> | MySqlMediumInt<any> | SingleStoreMediumInt<any> | SingleStoreFloat<any>
		>(column, [
			'PgReal',
			'MySqlFloat',
			'MySqlMediumInt',
			'SingleStoreMediumInt',
			'SingleStoreFloat',
		])
	) {
		min = unsigned ? 0 : CONSTANTS.INT24_MIN;
		max = unsigned ? CONSTANTS.INT24_UNSIGNED_MAX : CONSTANTS.INT24_MAX;
		integer = isColumnType(column, ['MySqlMediumInt', 'SingleStoreMediumInt']);
	} else if (
		isColumnType<PgInteger<any> | PgSerial<any> | MySqlInt<any> | SingleStoreInt<any>>(column, [
			'PgInteger',
			'PgSerial',
			'MySqlInt',
			'SingleStoreInt',
		])
	) {
		min = unsigned ? 0 : CONSTANTS.INT32_MIN;
		max = unsigned ? CONSTANTS.INT32_UNSIGNED_MAX : CONSTANTS.INT32_MAX;
		integer = true;
	} else if (
		isColumnType<
			| PgDoublePrecision<any>
			| MySqlReal<any>
			| MySqlDouble<any>
			| SingleStoreReal<any>
			| SingleStoreDouble<any>
			| SQLiteReal<any>
		>(column, [
			'PgDoublePrecision',
			'MySqlReal',
			'MySqlDouble',
			'SingleStoreReal',
			'SingleStoreDouble',
			'SQLiteReal',
		])
	) {
		min = unsigned ? 0 : CONSTANTS.INT48_MIN;
		max = unsigned ? CONSTANTS.INT48_UNSIGNED_MAX : CONSTANTS.INT48_MAX;
	} else if (
		isColumnType<
			| PgBigInt53<any>
			| PgBigSerial53<any>
			| MySqlBigInt53<any>
			| MySqlSerial<any>
			| SingleStoreBigInt53<any>
			| SingleStoreSerial<any>
			| SQLiteInteger<any>
		>(
			column,
			[
				'PgBigInt53',
				'PgBigSerial53',
				'MySqlBigInt53',
				'MySqlSerial',
				'SingleStoreBigInt53',
				'SingleStoreSerial',
				'SQLiteInteger',
			],
		)
	) {
		unsigned = unsigned || isColumnType(column, ['MySqlSerial', 'SingleStoreSerial']);
		min = unsigned ? 0 : Number.MIN_SAFE_INTEGER;
		max = Number.MAX_SAFE_INTEGER;
		integer = true;
	} else if (isColumnType<MySqlYear<any> | SingleStoreYear<any>>(column, ['MySqlYear', 'SingleStoreYear'])) {
		min = 1901;
		max = 2155;
		integer = true;
	} else {
		min = Number.MIN_SAFE_INTEGER;
		max = Number.MAX_SAFE_INTEGER;
	}

	let schema = coerce === true || coerce?.number
		? integer ? z.coerce.number() : z.coerce.number().int()
		: integer
		? z.int()
		: z.number();
	schema = schema.gte(min).lte(max);
	return schema;
}

function bigintColumnToSchema(
	column: Column,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>['coerce'],
): zod.ZodType {
	const unsigned = column.getSQLType().includes('unsigned');
	const min = unsigned ? 0n : CONSTANTS.INT64_MIN;
	const max = unsigned ? CONSTANTS.INT64_UNSIGNED_MAX : CONSTANTS.INT64_MAX;

	const schema = coerce === true || coerce?.bigint ? z.coerce.bigint() : z.bigint();
	return schema.gte(min).lte(max);
}

function stringColumnToSchema(
	column: Column,
	z: typeof zod,
	coerce: CreateSchemaFactoryOptions<
		Partial<Record<'bigint' | 'boolean' | 'date' | 'number' | 'string', true>> | true | undefined
	>['coerce'],
): zod.ZodType {
	if (isColumnType<PgUUID<ColumnBaseConfig<'string', 'PgUUID'>>>(column, ['PgUUID'])) {
		return z.uuid();
	}

	let max: number | undefined;
	let regex: RegExp | undefined;
	let fixed = false;

	if (isColumnType<PgVarchar<any> | SQLiteText<any>>(column, ['PgVarchar', 'SQLiteText'])) {
		max = column.length;
	} else if (
		isColumnType<MySqlVarChar<any> | SingleStoreVarChar<any>>(column, ['MySqlVarChar', 'SingleStoreVarChar'])
	) {
		max = column.length ?? CONSTANTS.INT16_UNSIGNED_MAX;
	} else if (isColumnType<MySqlText<any> | SingleStoreText<any>>(column, ['MySqlText', 'SingleStoreText'])) {
		if (column.textType === 'longtext') {
			max = CONSTANTS.INT32_UNSIGNED_MAX;
		} else if (column.textType === 'mediumtext') {
			max = CONSTANTS.INT24_UNSIGNED_MAX;
		} else if (column.textType === 'text') {
			max = CONSTANTS.INT16_UNSIGNED_MAX;
		} else {
			max = CONSTANTS.INT8_UNSIGNED_MAX;
		}
	}

	if (
		isColumnType<PgChar<any> | MySqlChar<any> | SingleStoreChar<any>>(column, [
			'PgChar',
			'MySqlChar',
			'SingleStoreChar',
		])
	) {
		max = column.length;
		fixed = true;
	}

	if (isColumnType<PgBinaryVector<any>>(column, ['PgBinaryVector'])) {
		regex = /^[01]+$/;
		max = column.dimensions;
	}

	let schema = coerce === true || coerce?.string ? z.coerce.string() : z.string();
	schema = regex ? schema.regex(regex) : schema;
	return max && fixed ? schema.length(max) : max ? schema.max(max) : schema;
}
