import type { Cache } from './cache/core/cache.ts';
import type { CodecsCollection } from './codecs.ts';
import type { AnyColumn } from './column.ts';
import { Column } from './column.ts';
import { is } from './entity.ts';
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

	const result = columns.reduce<Record<string, any>>(
		(result, { path, field, codec, arrayDimensions }, columnIndex) => {
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
					const value = node[pathChunk] = rawValue === null
						? null
						: decoder.mapFromDriverValue(codec ? codec(rawValue, arrayDimensions!) : rawValue);

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

/** @internal bypass bundle-time filtering */
export const FnConstructor = Object.getPrototypeOf(() => null).constructor as typeof Function;

/** @internal */
function makeJitQueryMapperInner(
	columns: SelectedFieldsOrdered<AnyColumn>,
	joinsNotNullableMap: Record<string, boolean> = {},
): string {
	const preFn = [] as string[];
	const fn = [] as string[];
	fn.push(`const [ ${columns.map((_, i) => `c${i}`).join(', ')} ] = rows[i];`);

	const nullifyMap: Record<string, string | false> = {};
	const objectIds: Record<string, string[]> = {};
	const decodes = Array.from<string>({ length: columns.length });

	for (let idx = 0; idx < columns.length; ++idx) {
		const { field, path, codec, arrayDimensions } = columns[idx]!;
		let decoder: DriverValueDecoder<unknown, unknown>;
		let decoderStr: string;
		let decoderFieldDestructure: string;
		let isColumn = false;
		if (is(field, Column)) {
			isColumn = true;
			decoder = field;
			decoderFieldDestructure = `field: decoder${idx}`;
		} else if (is(field, SQL)) {
			decoder = field.decoder;
			decoderFieldDestructure = `field: { decoder: decoder${idx} }`;
		} else if (is(field, Subquery)) {
			decoder = field._.sql.decoder;
			decoderFieldDestructure = `field: { _: { sql: { decoder: decoder${idx} } } }`;
		} else {
			decoder = field.sql.decoder;
			decoderFieldDestructure = `field: { sql: { decoder: decoder${idx} } }`;
		}
		decoderStr = `decoder${idx}.mapFromDriverValue`;
		if (decoder.mapFromDriverValue.isNoop) decoderStr = '';
		if (decoderStr) {
			preFn.push(`const { ${decoderFieldDestructure}${codec ? `, codec: codec${idx}` : ''} } = columns[${idx}];`);
		} else if (codec) {
			preFn.push(`const { codec: codec${idx} } = columns[${idx}];`);
		}

		const colStr = `c${idx}`;
		let decodedValue = colStr;
		if (codec) decodedValue = `codec${idx}(${decodedValue}, ${arrayDimensions})`;
		if (decoderStr) decodedValue = `${decoderStr}(${decodedValue})`;
		decodes[idx] = colStr === decodedValue
			? `${colStr}`
			: `${colStr} === null ? ${colStr} : ${decodedValue}`;

		if (path.length !== 2 || !isColumn) continue;
		if (objectIds[path[0]!] === undefined) objectIds[path[0]!] = [`c${idx}`];
		else objectIds[path[0]!]?.push(`c${idx}`);
		const [objectName] = path as [string];
		const tableName = getTableName((<Column> field).table);
		nullifyMap[objectName] = joinsNotNullableMap[tableName] ? false : typeof nullifyMap[objectName] === 'string'
			? nullifyMap[objectName] === tableName ? tableName : false
			: tableName;
	}

	fn.push(`mapped[i] = {`);
	let currentObjectPath: string[] = [];
	for (let idx = 0; idx < columns.length; ++idx) {
		const { path } = columns[idx]!;
		const jsonPath = path.map((e) => JSON.stringify(e));
		const decodedValue = decodes[idx]!;

		const objectPath = path.slice(0, -1);
		let commonLen = 0;
		while (
			commonLen < currentObjectPath.length
			&& commonLen < objectPath.length
			&& currentObjectPath[commonLen] === objectPath[commonLen]
		) commonLen++;

		for (let d = currentObjectPath.length - 1; d >= commonLen; --d) {
			fn.push(`${'\t'.repeat(d + 1)}},`);
		}

		for (let d = commonLen; d < objectPath.length; ++d) {
			fn.push(
				`${'\t'.repeat(d + 1)}${jsonPath[d]}: ${
					d === 0 && objectPath.length === 1 && typeof nullifyMap[path[0]!] === 'string'
						? `${objectIds[path[0]!]?.map((c) => `${c} === null`).join(' && ')} ? null : {`
						: '{'
				}`,
			);
		}

		currentObjectPath = objectPath;
		fn.push(`${'\t'.repeat(path.length)}${jsonPath[path.length - 1]}: ${decodedValue},`);
	}

	for (let d = currentObjectPath.length - 1; d >= 0; --d) {
		fn.push(`${'\t'.repeat(d + 1)}},`);
	}
	fn.push(`};`);

	return `${preFn.length ? `${preFn.join('\n\t')}\n\t` : ''}for (let i = 0; i < length; ++i) {
		${fn.join('\n\t\t')}
	}`;
}

export type RowsMapperGenerator = <TResult = any>(
	columns: SelectedFieldsOrdered<AnyColumn>,
	joinsNotNullableMap: Record<string, boolean> | undefined,
) => RowsMapper<TResult>;
export interface RowsMapper<TResult = Record<string, unknown>[]> {
	(rows: unknown[][]): TResult;
	/** @internal jit mapper's function body for debugging */
	body?: string;
}

export function makeJitQueryMapper<TResult>(
	columns: SelectedFieldsOrdered<AnyColumn>,
	joinsNotNullableMap: Record<string, boolean> | undefined,
): RowsMapper<TResult> {
	const internals = `\t"use strict";
	const { columns } = this;
	const { length } = rows;
	const mapped = Array.from({ length });
	${makeJitQueryMapperInner(columns, joinsNotNullableMap)}
	return mapped;
	//# sourceURL=drizzle:jit-query-mapper`;

	const fn = Object.assign(
		new FnConstructor(
			'rows',
			internals,
		).bind({
			columns,
		}),
		{ body: `function jitQueryMapper (rows) {\n${internals}\n}` },
	) as RowsMapper<TResult>;

	return fn;
}

/** @internal */
export function jitCompatCheck(isEnabled?: boolean): boolean {
	if (!isEnabled) return false;

	try {
		const res = new FnConstructor('input', '"use strict"; return input;')(true);
		if (res !== true) {
			// In case it's broken in runtime but not forbidden
			console.warn(
				'Unable to use jit mappers due to incompatibility: corrupted jit function output.\nFalling back to premade mappers.\nError details:',
			);
			console.error(`Expected to receive \`true\`, got: ${res}`);
		}
		return true;
	} catch (e) {
		console.warn(
			'Unable to use jit mappers due to incompatibility.\nFalling back to premade mappers.\nError details:',
		);
		console.error(e);
		return false;
	}
}

export function makeDefaultQueryMapper<TResult>(
	columns: SelectedFieldsOrdered<AnyColumn>,
	joinsNotNullableMap: Record<string, boolean> | undefined,
): RowsMapper<TResult> {
	const interpretedData = columns.map(({ field, codec, arrayDimensions, path }) => {
		let processNullifyMap: ((nullifyMap: Record<string, string | false>, value: any) => void) | undefined;
		let decoderSrc: DriverValueDecoder<unknown, unknown>;
		if (is(field, Column)) {
			decoderSrc = field;

			if (joinsNotNullableMap && path.length === 2) {
				const objectName = path[0]!;
				processNullifyMap = (nullifyMap, value) => {
					if (!(objectName in nullifyMap)) {
						nullifyMap[objectName] = value === null ? getTableName(field.table) : false;
					} else if (
						typeof nullifyMap[objectName] === 'string' && nullifyMap[objectName] !== getTableName(field.table)
					) {
						nullifyMap[objectName] = false;
					}
				};
			}
		} else if (is(field, SQL)) {
			decoderSrc = field.decoder;
		} else if (is(field, Subquery)) {
			decoderSrc = field._.sql.decoder;
		} else {
			decoderSrc = field.sql.decoder;
		}

		let decoder: ((v: any) => any) | undefined;
		if (decoderSrc.mapFromDriverValue.isNoop) {
			decoder = codec ? (v: any) => codec(v, arrayDimensions!) : undefined;
		} else {
			decoder = codec
				? (v: any) => decoderSrc.mapFromDriverValue(codec(v, arrayDimensions!))
				: (v: any) => decoderSrc.mapFromDriverValue(v);
		}

		return [decoder, processNullifyMap] as const;
	});

	return ((rows) =>
		rows.map((row) => {
			// Key -> nested object key, value -> table name if all fields in the nested object are from the same table, false otherwise
			const nullifyMap: Record<string, string | false> = {};

			const result = columns.reduce<Record<string, any>>(
				(result, { path }, columnIndex) => {
					let node = result;
					for (const [pathChunkIndex, pathChunk] of path.entries()) {
						if (pathChunkIndex < path.length - 1) {
							if (!(pathChunk in node)) {
								node[pathChunk] = {};
							}
							node = node[pathChunk];
						} else {
							const [decoder, processNullifyMap] = interpretedData[columnIndex]!;

							const rawValue = row[columnIndex]!;
							const value = node[pathChunk] = rawValue === null
								? null
								: decoder
								? decoder(rawValue)
								: rawValue;

							processNullifyMap?.(nullifyMap, value);
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
		})) as RowsMapper<TResult>;
}
/** @internal */
export function orderSelectedFields<TColumn extends AnyColumn>(
	fields: Record<string, unknown>,
	pathPrefix?: string[],
	codecs?: CodecsCollection,
): SelectedFieldsOrdered<TColumn> {
	return Object.entries(fields).reduce<SelectedFieldsOrdered<AnyColumn>>((result, [name, field]) => {
		if (typeof name !== 'string') {
			return result;
		}

		const newPath = pathPrefix ? [...pathPrefix, name] : [name];
		if (is(field, Column)) {
			result.push({
				path: newPath,
				field,
				codec: codecs?.get(field, 'normalize'),
				arrayDimensions: (<any> field).dimensions,
			});
		} else if (is(field, Column) || is(field, SQL) || is(field, SQL.Aliased) || is(field, Subquery)) {
			result.push({ path: newPath, field });
		} else if (is(field, Table)) {
			result.push(...orderSelectedFields(field[Table.Symbol.Columns], newPath, codecs));
		} else {
			result.push(...orderSelectedFields(field as Record<string, unknown>, newPath, codecs));
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

export interface DrizzleConfig<
	TSchema extends Record<string, unknown> = Record<string, never>,
	TRelationConfigs extends AnyRelations = EmptyRelations,
> {
	logger?: boolean | Logger | undefined;
	schema?: TSchema | undefined;
	relations?: TRelationConfigs | undefined;
	cache?: Cache | undefined;
	useJitMappers?: boolean | undefined;
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

	if ('mode' in data) {
		if (data['mode'] !== 'default' && data['mode'] !== 'planetscale' && data['mode'] !== undefined) return false;

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

	if ('useJitMappers' in data) {
		const type = typeof data['useJitMappers'];
		if (type !== 'boolean' && type !== 'undefined') return false;

		return true;
	}

	if ('codecs' in data) {
		const type = typeof data['connection'];
		if (type !== 'object' && type !== 'undefined') return false;

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

export function base64ToUint8Array(base64: string): Uint8Array {
	if (!base64) return new Uint8Array(0);
	const binary = atob(base64);
	const len = binary.length;
	const bytes = new Uint8Array(len);

	for (let i = 0; i < len; ++i) {
		bytes[i] = binary.charCodeAt(i);
	}

	return bytes;
}

export type PartialWithUndefined<T> = {
	[K in keyof T]?: T[K] | undefined;
};
