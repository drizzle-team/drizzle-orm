import type { Cache } from './cache/core/cache.ts';
import type { AnyColumn, Column } from './column.ts';
import { ChunkKind, chunkKind, is } from './entity.ts';
import type { Logger } from './logger.ts';
import type { SelectedFieldsFlat, SelectedFieldsOrdered } from './operations.ts';
import type { TableLike } from './query-builders/select.types.ts';
import type { AnyRelations, EmptyRelations } from './relations.ts';
import { Param, SQL, View } from './sql/sql.ts';
import type { DriverValueDecoder } from './sql/sql.ts';
import { Subquery } from './subquery.ts';
import { getTableName, Table } from './table.ts';
import { ViewBaseConfig } from './view-common.ts';

/** @internal */
export function mapResultRow<TResult>(
	columns: SelectedFieldsOrdered<AnyColumn>,
	row: unknown[] | (readonly unknown[]),
	joinsNotNullableMap: Record<string, boolean> | undefined,
): TResult {
	// Key -> nested object key, value -> table name if all fields in the nested object are from the same table, false otherwise
	const nullifyMap: Record<string, string | false> = {};

	const result: Record<string, any> = {};
	for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
		const { path, field } = columns[columnIndex]!;

		// Fast decoder dispatch via chunkKind discriminant instead of is() cascade.
		// is() walks the prototype chain (expensive); chunkKind is a single symbol-keyed property read.
		let decoder: DriverValueDecoder<unknown, unknown>;
		const kind = (field as any)[chunkKind];
		if (kind === ChunkKind.Column) {
			decoder = field as any;
		} else if (kind === ChunkKind.SQL) {
			decoder = (field as any).decoder;
		} else if (kind === ChunkKind.Subquery) {
			decoder = (field as any)._.sql.decoder;
		} else {
			// SQL.Aliased
			decoder = (field as any).sql.decoder;
		}

		const pathLen = path.length;

		// Fast path: flat fields (path length === 1) — the common case for simple SELECTs.
		// Avoids the inner loop, intermediate node traversal, and `in` checks entirely.
		if (pathLen === 1) {
			const rawValue = row[columnIndex]!;
			result[path[0]!] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
		} else {
			// Nested path: traverse/create intermediate objects, then assign the leaf.
			let node = result;
			const lastIndex = pathLen - 1;
			for (let i = 0; i < lastIndex; i++) {
				const pathChunk = path[i]!;
				if (!(pathChunk in node)) {
					node[pathChunk] = {};
				}
				node = node[pathChunk];
			}
			const leafKey = path[lastIndex]!;
			const rawValue = row[columnIndex]!;
			const value = node[leafKey] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);

			if (joinsNotNullableMap && kind === ChunkKind.Column && pathLen === 2) {
				const objectName = path[0]!;
				if (!(objectName in nullifyMap)) {
					nullifyMap[objectName] = value === null ? getTableName((field as AnyColumn).table) : false;
				} else if (
					typeof nullifyMap[objectName] === 'string'
					&& nullifyMap[objectName] !== getTableName((field as AnyColumn).table)
				) {
					nullifyMap[objectName] = false;
				}
			}
		}
	}

	// Nullify all nested objects from nullifyMap that are nullable
	if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
		for (const objectName in nullifyMap) {
			const tableName = nullifyMap[objectName];
			if (typeof tableName === 'string' && !joinsNotNullableMap[tableName]) {
				result[objectName] = null;
			}
		}
	}

	return result as TResult;
}

/**
 * @internal Cache for orderSelectedFields() — keyed by the fields record reference.
 * When `.returning()` is called with no arguments, it always passes the same
 * `table[Table.Symbol.Columns]` reference, so the result is computed once per table.
 */
const orderedFieldsCache = new WeakMap<Record<string, unknown>, SelectedFieldsOrdered<AnyColumn>>();

/** @internal */
export function orderSelectedFields<TColumn extends AnyColumn>(
	fields: Record<string, unknown>,
	pathPrefix?: string[],
): SelectedFieldsOrdered<TColumn> {
	// Only use cache for top-level calls (no pathPrefix) to avoid
	// caching intermediate recursive results that include a prefix.
	if (!pathPrefix) {
		const cached = orderedFieldsCache.get(fields);
		if (cached) return cached as SelectedFieldsOrdered<TColumn>;
	}

	const result: SelectedFieldsOrdered<AnyColumn> = [];
	const keys = Object.keys(fields);
	for (let i = 0; i < keys.length; i++) {
		const name = keys[i]!;
		const field = fields[name];

		// Build path: avoid spread for the common top-level case (no prefix).
		// pathPrefix.concat(name) is faster than [...pathPrefix, name] as it avoids the spread iterator.
		const newPath = pathPrefix ? pathPrefix.concat(name) : [name];

		// Fast dispatch via chunkKind discriminant instead of is() cascade.
		const kind = (field as any)?.[chunkKind];
		if (
			kind === ChunkKind.Column
			|| kind === ChunkKind.SQL
			|| kind === ChunkKind.SQLAliased
			|| kind === ChunkKind.Subquery
		) {
			result.push({ path: newPath, field: field as AnyColumn | SQL | SQL.Aliased | Subquery });
		} else if (kind === ChunkKind.Table) {
			const tableFields = orderSelectedFields((field as Table)[Table.Symbol.Columns], newPath);
			for (let j = 0; j < tableFields.length; j++) {
				result.push(tableFields[j]!);
			}
		} else {
			// Unknown record — recurse
			const nested = orderSelectedFields(field as Record<string, unknown>, newPath);
			for (let j = 0; j < nested.length; j++) {
				result.push(nested[j]!);
			}
		}
	}

	if (!pathPrefix) {
		orderedFieldsCache.set(fields, result);
	}

	return result as SelectedFieldsOrdered<TColumn>;
}

export function haveSameKeys(left: Record<string, unknown>, right: Record<string, unknown>) {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);

	if (leftKeys.length !== rightKeys.length) {
		return false;
	}

	for (const [index, key] of leftKeys.entries()) {
		if (key !== rightKeys[index]) {
			return false;
		}
	}

	return true;
}

/** @internal */
export function mapUpdateSet(table: Table, values: Record<string, unknown>): UpdateSet {
	const columns = table[Table.Symbol.Columns];
	const result: UpdateSet = {};
	let hasValues = false;

	for (const key in values) {
		const value = values[key];
		if (value === undefined) continue;
		hasValues = true;
		const kind = (value as any)?.[chunkKind];
		if (kind === ChunkKind.SQL || kind === ChunkKind.Column) {
			result[key] = value as SQL | AnyColumn;
		} else {
			result[key] = new Param(value, columns[key]);
		}
	}

	if (!hasValues) {
		throw new Error('No values to set');
	}

	return result;
}

export type UpdateSet = Record<string, SQL | Param | AnyColumn | null | undefined>;

export type OneOrMany<T> = T | T[];

export type Update<T, TUpdate> =
	& {
		[K in Exclude<keyof T, keyof TUpdate>]: T[K];
	}
	& TUpdate;

export type Simplify<T> =
	& {
		// @ts-ignore - "Type parameter 'K' has a circular constraint", not sure why
		[K in keyof T]: T[K];
	}
	& {};

export type Not<T extends boolean> = T extends true ? false : true;

export type IsNever<T> = [T] extends [never] ? true : false;

export type IsUnion<T, U extends T = T> = (T extends any ? (U extends T ? false : true) : never) extends false ? false
	: true;

export type SingleKeyObject<T, TError extends string, K = keyof T> = IsNever<K> extends true ? never
	: IsUnion<K> extends true ? DrizzleTypeError<TError>
	: T;

export type FromSingleKeyObject<T, Result, TError extends string, K = keyof T> = IsNever<K> extends true ? never
	: IsUnion<K> extends true ? DrizzleTypeError<TError>
	: Result;

export type SimplifyMappedType<T> = [T] extends [unknown] ? T : never;

export type ShallowRecord<K extends keyof any, T> = SimplifyMappedType<{ [P in K]: T }>;

export type Assume<T, U> = T extends U ? T : U;

export type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;

export interface DrizzleTypeError<T extends string> {
	$drizzleTypeError: T;
}

export type ValueOrArray<T> = T | T[];

/** @internal */
export function applyMixins(baseClass: any, extendedClasses: any[]) {
	for (const extendedClass of extendedClasses) {
		for (const name of Object.getOwnPropertyNames(extendedClass.prototype)) {
			if (name === 'constructor') continue;

			Object.defineProperty(
				baseClass.prototype,
				name,
				Object.getOwnPropertyDescriptor(extendedClass.prototype, name) || Object.create(null),
			);
		}
	}
}

export type Or<T1, T2> = T1 extends true ? true : T2 extends true ? true : false;

export type IfThenElse<If, Then, Else> = If extends true ? Then : Else;

export type PromiseOf<T> = T extends Promise<infer U> ? U : T;

export type Writable<T> = {
	-readonly [P in keyof T]: T[P];
};

export type NonArray<T> = T extends any[] ? never : T;

/**
 * @deprecated
 * Use `getColumns` instead
 */
export function getTableColumns<T extends Table>(table: T): T['_']['columns'] {
	return table[Table.Symbol.Columns];
}

export function getViewSelectedFields<T extends View>(view: T): T['_']['selectedFields'] {
	return view[ViewBaseConfig].selectedFields;
}

export function getColumns<T extends Table | View | Subquery>(
	table: T,
): T extends Table ? T['_']['columns']
	: T extends View ? T['_']['selectedFields']
	: T extends Subquery ? T['_']['selectedFields']
	: never
{
	return (is(table, Table)
		? table[Table.Symbol.Columns]
		: is(table, View)
		? table[ViewBaseConfig].selectedFields
		: table._.selectedFields) as any;
}

/** @internal */
export function getTableLikeName(table: TableLike): string | undefined {
	return is(table, Subquery)
		? table._.alias
		: is(table, View)
		? table[ViewBaseConfig].name
		: is(table, SQL)
		? undefined
		: table[Table.Symbol.IsAlias]
		? table[Table.Symbol.Name]
		: table[Table.Symbol.BaseName];
}

export type ColumnsWithTable<
	TTableName extends string,
	TForeignTableName extends string,
	TColumns extends AnyColumn<{ tableName: TTableName }>[],
> = { [Key in keyof TColumns]: AnyColumn<{ tableName: TForeignTableName }> };

export type Casing = 'snake_case' | 'camelCase';

export interface DrizzleConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelationConfigs extends AnyRelations = EmptyRelations,
> {
	logger?: boolean | Logger | undefined;
	schema?: TSchema | undefined;
	casing?: Casing | undefined;
	relations?: TRelationConfigs | undefined;
	cache?: Cache | undefined;
}
export type ValidateShape<T, ValidShape, TResult = T> = T extends ValidShape
	? Exclude<keyof T, keyof ValidShape> extends never ? TResult
	: DrizzleTypeError<
		`Invalid key(s): ${Exclude<(keyof T) & (string | number | bigint | boolean | null | undefined), keyof ValidShape>}`
	>
	: never;

export type KnownKeysOnly<T, U> = {
	[K in keyof T]: K extends keyof U ? T[K] : never;
};

export type IsAny<T> = 0 extends (1 & T) ? true : false;

/** @internal */
export function getColumnNameAndConfig<
	TConfig extends Record<string, any> | undefined,
>(a: string | TConfig | undefined, b: TConfig | undefined) {
	return {
		name: typeof a === 'string' && a.length > 0 ? a : '' as string,
		config: typeof a === 'object' ? a : b as TConfig,
	};
}

export type IfNotImported<T, Y, N> = unknown extends T ? Y : N;

export type ImportTypeError<TPackageName extends string> =
	`Please install \`${TPackageName}\` to allow Drizzle ORM to connect to the database`;

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Keys extends any
	? Required<Pick<T, Keys>> & Partial<Omit<T, Keys>>
	: never;

type ExpectedConfigShape = {
	logger?: boolean | {
		logQuery(query: string, params: unknown[]): void;
	} | undefined;
	schema?: Record<string, never> | undefined;
	relations?: AnyRelations | undefined;
	casing?: 'snake_case' | 'camelCase' | undefined;
};

// If this errors, you must update config shape checker function with new config specs
const _: DrizzleConfig<any, any> = {} as ExpectedConfigShape;
const __: ExpectedConfigShape = {} as DrizzleConfig;

export function isConfig(data: any): boolean {
	if (typeof data !== 'object' || data === null) return false;

	if (data.constructor.name !== 'Object') return false;

	if ('logger' in data) {
		const type = typeof data['logger'];
		if (
			type !== 'boolean' && (type !== 'object' || typeof data['logger']['logQuery'] !== 'function')
			&& type !== 'undefined'
		) return false;

		return true;
	}

	if ('schema' in data) {
		const type = typeof data['schema'];
		if (type !== 'object' && type !== 'undefined') return false;

		return true;
	}

	if ('relations' in data) {
		const type = typeof data['relations'];
		if (type !== 'object' && type !== 'undefined') return false;

		return true;
	}

	if ('casing' in data) {
		const type = typeof data['casing'];
		if (type !== 'string' && type !== 'undefined') return false;

		return true;
	}

	if ('mode' in data) {
		if (data['mode'] !== 'default' || data['mode'] !== 'planetscale' || data['mode'] !== undefined) return false;

		return true;
	}

	if ('connection' in data) {
		const type = typeof data['connection'];
		if (type !== 'string' && type !== 'object' && type !== 'undefined') return false;

		return true;
	}

	if ('client' in data) {
		const type = typeof data['client'];
		if (type !== 'object' && type !== 'function' && type !== 'undefined') return false;

		return true;
	}

	if (Object.keys(data).length === 0) return true;

	return false;
}

export type NeonAuthToken = string | (() => string | Promise<string>);

export const textDecoder = typeof TextDecoder === 'undefined' ? null : new TextDecoder();

export function assertUnreachable(_x: never | undefined): never {
	throw new Error("Didn't expect to get here");
}

export function isWithEnum(column: Column<any>): column is typeof column & { enumValues: [string, ...string[]] };
export function isWithEnum(value: unknown): value is { enumValues: [string, ...string[]] };
export function isWithEnum(value: unknown): boolean {
	return ((typeof value === 'object' && value !== null) || typeof value === 'function') && 'enumValues' in value
		&& Array.isArray(value.enumValues)
		&& value.enumValues.length > 0;
}

export type Literal = string | number | boolean | null;
export type Json = Literal | { [key: string]: any } | any[];

export type ColumnIsGeneratedAlwaysAs<TColumn> = TColumn extends Column<any>
	? TColumn['_']['identity'] extends 'always' ? true
	: TColumn['_'] extends { generated: undefined } ? false
	: TColumn['_']['generated'] extends { type: 'byDefault' } ? false
	: true
	: false;

export type GetSelection<T extends SelectedFieldsFlat<Column<any>> | Table<any> | View> = T extends Table<any>
	? T['_']['columns']
	: T extends View ? T['_']['selectedFields']
	: T;

export type RemoveNeverElements<T extends any[]> = T extends [infer First, ...infer Rest]
	? IsNever<First> extends true ? RemoveNeverElements<Rest>
	: [First, ...RemoveNeverElements<Rest>]
	: [];

export type HasBaseColumn<TColumn> = TColumn extends { _: { baseColumn: Column | undefined } }
	? IsNever<TColumn['_']['baseColumn']> extends false ? true
	: false
	: false;

export type EnumValuesToEnum<TEnumValues extends [string, ...string[]]> = { [K in TEnumValues[number]]: K };

export type EnumValuesToReadonlyEnum<TEnumValues extends [string, ...string[]]> = {
	readonly [K in TEnumValues[number]]: K;
};

export const CONSTANTS = {
	INT8_MIN: -128,
	INT8_MAX: 127,
	INT8_UNSIGNED_MAX: 255,
	INT16_MIN: -32768,
	INT16_MAX: 32767,
	INT16_UNSIGNED_MAX: 65535,
	INT24_MIN: -8388608,
	INT24_MAX: 8388607,
	INT24_UNSIGNED_MAX: 16777215,
	INT32_MIN: -2147483648,
	INT32_MAX: 2147483647,
	INT32_UNSIGNED_MAX: 4294967295,
	INT48_MIN: -140737488355328,
	INT48_MAX: 140737488355327,
	INT48_UNSIGNED_MAX: 281474976710655,
	INT64_MIN: -9223372036854775808n,
	INT64_MAX: 9223372036854775807n,
	INT64_UNSIGNED_MAX: 18446744073709551615n,
};
