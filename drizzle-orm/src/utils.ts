import type { AnyColumn } from './column.ts';
import { Column } from './column.ts';
import { is } from './entity.ts';
import type { Logger } from './logger.ts';
import type { SelectedFieldsOrdered } from './operations.ts';
import type { TableLike } from './query-builders/select.types.ts';
import { Param, SQL, View } from './sql/sql.ts';
import type { DriverValueDecoder } from './sql/sql.ts';
import { Subquery, SubqueryConfig } from './subquery.ts';
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
		if (is(field, Column) || is(field, SQL) || is(field, SQL.Aliased)) {
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
			if (is(value, SQL)) {
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

export type UpdateSet = Record<string, SQL | Param | null | undefined>;

export type OneOrMany<T> = T | T[];

export type Update<T, TUpdate> = Simplify<
	& {
		[K in Exclude<keyof T, keyof TUpdate>]: T[K];
	}
	& TUpdate
>;

export type Simplify<T> =
	& {
		// @ts-ignore - "Type parameter 'K' has a circular constraint", not sure why
		[K in keyof T]: T[K];
	}
	& {};

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

export function getTableColumns<T extends Table>(table: T): T['_']['columns'] {
	return table[Table.Symbol.Columns];
}

/** @internal */
export function getTableLikeName(table: TableLike): string | undefined {
	return is(table, Subquery)
		? table[SubqueryConfig].alias
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

export interface DrizzleConfig<TSchema extends Record<string, unknown> = Record<string, never>> {
	logger?: boolean | Logger;
	schema?: TSchema;
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
