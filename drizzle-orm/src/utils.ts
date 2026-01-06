import type { Cache } from './cache/core/cache.ts';
import type { AnyColumn } from './column.ts';
import { Column } from './column.ts';
import { is } from './entity.ts';
import type { Logger } from './logger.ts';
import type { SelectedFieldsOrdered } from './operations.ts';
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
	row: unknown[],
	joinsNotNullableMap: Record<string, boolean> | undefined,
): TResult {
	// Key -> nested object key, value -> table name if all fields in the nested object are from the same table, false otherwise
	const nullifyMap: Record<string, string | false> = {};

	const result = columns.reduce<Record<string, any>>(
		(result, { path, field }, columnIndex) => {
			let decoder: DriverValueDecoder<unknown, unknown>;
			if (is(field, Column)) {
				decoder = field;
			} else if (is(field, SQL)) {
				decoder = field.decoder;
			} else if (is(field, Subquery)) {
				decoder = field._.sql.decoder;
			} else {
				decoder = field.sql.decoder;
			}
			let node = result;
			for (const [pathChunkIndex, pathChunk] of path.entries()) {
				if (pathChunkIndex < path.length - 1) {
					if (!(pathChunk in node)) {
						node[pathChunk] = {};
					}
					node = node[pathChunk];
				} else {
					const rawValue = row[columnIndex]!;
					const value = node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);

					if (joinsNotNullableMap && is(field, Column) && path.length === 2) {
						const objectName = path[0]!;
						if (!(objectName in nullifyMap)) {
							nullifyMap[objectName] = value === null ? getTableName(field.table) : false;
						} else if (
							typeof nullifyMap[objectName] === 'string' && nullifyMap[objectName] !== getTableName(field.table)
						) {
							nullifyMap[objectName] = false;
						}
					}
				}
			}
			return result;
		},
		{},
	);

	// Nullify all nested objects from nullifyMap that are nullable
	if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
		for (const [objectName, tableName] of Object.entries(nullifyMap)) {
			if (typeof tableName === 'string' && !joinsNotNullableMap[tableName]) {
				result[objectName] = null;
			}
		}
	}

	return result as TResult;
}

/** @internal */
export function orderSelectedFields<TColumn extends AnyColumn>(
	fields: Record<string, unknown>,
	pathPrefix?: string[],
): SelectedFieldsOrdered<TColumn> {
	return Object.entries(fields).reduce<SelectedFieldsOrdered<AnyColumn>>((result, [name, field]) => {
		if (typeof name !== 'string') {
			return result;
		}

		const newPath = pathPrefix ? [...pathPrefix, name] : [name];
		if (is(field, Column) || is(field, SQL) || is(field, SQL.Aliased) || is(field, Subquery)) {
			result.push({ path: newPath, field });
		} else if (is(field, Table)) {
			result.push(...orderSelectedFields(field[Table.Symbol.Columns], newPath));
		} else {
			result.push(...orderSelectedFields(field as Record<string, unknown>, newPath));
		}
		return result;
	}, []) as SelectedFieldsOrdered<TColumn>;
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
	const entries: [string, UpdateSet[string]][] = Object.entries(values)
		.filter(([, value]) => value !== undefined)
		.map(([key, value]) => {
			// eslint-disable-next-line unicorn/prefer-ternary
			if (is(value, SQL) || is(value, Column)) {
				return [key, value];
			} else {
				return [key, new Param(value, table[Table.Symbol.Columns][key])];
			}
		});

	if (entries.length === 0) {
		throw new Error('No values to set');
	}

	return Object.fromEntries(entries);
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
	logger?: boolean | Logger;
	schema?: TSchema;
	casing?: Casing;
	relations?: TRelationConfigs;
	cache?: Cache;
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
	};
	schema?: Record<string, never>;
	relations?: AnyRelations;
	casing?: 'snake_case' | 'camelCase';
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
