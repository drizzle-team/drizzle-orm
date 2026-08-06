import type { CasingCache } from '~/casing.ts';
import { entityKind, is } from '~/entity.ts';
import { isPgEnum } from '~/pg-core/columns/enum.ts';
import type { SelectResult } from '~/query-builders/select.types.ts';
import { Subquery } from '~/subquery.ts';
import { tracer } from '~/tracing.ts';
import type { Assume, Equal } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { AnyColumn } from '../column.ts';
import { Column } from '../column.ts';
import { IsAlias, Table } from '../table.ts';

/**
 * This class is used to indicate a primitive param value that is used in `sql` tag.
 * It is only used on type level and is never instantiated at runtime.
 * If you see a value of this type in the code, its runtime value is actually the primitive param value.
 */
export class FakePrimitiveParam {
	static readonly [entityKind]: string = 'FakePrimitiveParam';
}

export type Chunk =
	| string
	| Table
	| View
	| AnyColumn
	| Name
	| Param
	| Placeholder
	| SQL;

export interface BuildQueryConfig {
	casing: CasingCache;
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
	escapeString(str: string): string;
	prepareTyping?: (encoder: DriverValueEncoder<unknown, unknown>) => QueryTypingsValue;
	paramStartIndex?: { value: number };
	inlineParams?: boolean;
	invokeSource?: 'indexes' | undefined;
}

export type QueryTypingsValue = 'json' | 'decimal' | 'time' | 'timestamp' | 'uuid' | 'date' | 'none';

export interface Query {
	sql: string;
	params: unknown[];
}

export interface QueryWithTypings extends Query {
	typings?: QueryTypingsValue[];
}

/**
 * Any value that implements the `getSQL` method. The implementations include:
 * - `Table`
 * - `Column`
 * - `View`
 * - `Subquery`
 * - `SQL`
 * - `SQL.Aliased`
 * - `Placeholder`
 * - `Param`
 */
export interface SQLWrapper {
	getSQL(): SQL;
	shouldOmitSQLParens?(): boolean;
}

export function isSQLWrapper(value: unknown): value is SQLWrapper {
	return value !== null && value !== undefined && typeof (value as any).getSQL === 'function';
}

function addQueryTyping(result: QueryWithTypings, typing: QueryTypingsValue) {
	if (!result.typings) result.typings = [typing];
	else result.typings.push(typing);
}

function mergeQueryWithChunks(
	chunks: SQLChunk[],
	config: BuildQueryConfig & Required<Pick<BuildQueryConfig, 'inlineParams' | 'paramStartIndex'>>,
	result: QueryWithTypings
): void {
	for (let i = 0; i < chunks.length; i++) {
		mergeQueryWithChunk(chunks[i], config, result);
	}
}

function mergeQueryWithSQLChunk(
	chunk: SQL,
	config: BuildQueryConfig & Required<Pick<BuildQueryConfig, 'inlineParams' | 'paramStartIndex'>>,
	result: QueryWithTypings
) {
	mergeQueryWithChunks(chunk.queryChunks, {
		...config,
		inlineParams: config.inlineParams || chunk.shouldInlineParams,
	}, result);
}

function mergeQueryWithChunk(
	chunk: SQLChunk,
	config: BuildQueryConfig & Required<Pick<BuildQueryConfig, 'inlineParams' | 'paramStartIndex'>>,
	result: QueryWithTypings
): void {
	if (is(chunk, StringChunk)) {
		result.sql += chunk.value.join('');
		return;
	}

	if (is(chunk, Name)) {
		result.sql += config.escapeName(chunk.value);
		return;
	}

	if (chunk === undefined) {
		return;
	}

	if (Array.isArray(chunk)) {
		result.sql += '(';
		for (let i = 0; i < chunk.length; i++) {
			mergeQueryWithChunk(chunk[i], config, result);
			result.sql += i === chunk.length - 1 ? ')' : ', ';
		}
		return;
	}

	if (is(chunk, SQL)) {
		mergeQueryWithSQLChunk(chunk, config, result);
		return;
	}

	if (is(chunk, Table)) {
		const schemaName = chunk[Table.Symbol.Schema];
		const tableName = chunk[Table.Symbol.Name];

		result.sql += schemaName === undefined || chunk[IsAlias]
			? config.escapeName(tableName)
			: config.escapeName(schemaName) + '.' + config.escapeName(tableName);
		return;
	}

	if (is(chunk, Column)) {
		const columnName = config.casing.getColumnCasing(chunk);
		if (config.invokeSource === 'indexes') {
			result.sql += config.escapeName(columnName);
			return;
		}

		const schemaName = chunk.table[Table.Symbol.Schema];
		result.sql += chunk.table[IsAlias] || schemaName === undefined
			? config.escapeName(chunk.table[Table.Symbol.Name]) + '.' + config.escapeName(columnName)
			: config.escapeName(schemaName) + '.' + config.escapeName(chunk.table[Table.Symbol.Name]) + '.' + config.escapeName(columnName);
		return;
	}

	if (is(chunk, View)) {
		const { schema: schemaName, name: viewName, isAlias } = chunk[ViewBaseConfig];
		result.sql += schemaName === undefined || isAlias
			? config.escapeName(viewName)
			: config.escapeName(schemaName) + '.' + config.escapeName(viewName);
		return;
	}

	if (is(chunk, Param)) {
		if (is(chunk.value, Placeholder)) {
			result.sql += config.escapeParam(config.paramStartIndex.value++, chunk);
			result.params.push(chunk);
			addQueryTyping(result, 'none');
			return;
		}

		const mappedValue = chunk.value === null ? null : chunk.encoder.mapToDriverValue(chunk.value);
		if (is(mappedValue, SQL)) {
			mergeQueryWithSQLChunk(mappedValue, config, result);
			return;
		}

		if (config.inlineParams) {
			result.sql += mapInlineParam(mappedValue, config);
			return;
		}

		result.sql += config.escapeParam(config.paramStartIndex.value++, mappedValue);
		result.params.push(mappedValue);
		addQueryTyping(result, config.prepareTyping ? config.prepareTyping(chunk.encoder) : 'none');
		return;
	}

	if (is(chunk, Placeholder)) {
		result.sql += config.escapeParam(config.paramStartIndex.value++, chunk);
		result.params.push(chunk);
		addQueryTyping(result, 'none');
		return;
	}

	if (is(chunk, SQL.Aliased) && chunk.fieldAlias !== undefined) {
		result.sql += config.escapeName(chunk.fieldAlias);
		return;
	}

	if (is(chunk, Subquery)) {
		if (!chunk._.isWith) {
			result.sql += '(';
			mergeQueryWithSQLChunk(chunk._.sql, config, result);
			result.sql += ') ';
		}
		result.sql += config.escapeName(chunk._.alias);
		return;
	}

	if (isPgEnum(chunk)) {
		result.sql += chunk.schema
			? config.escapeName(chunk.schema) + '.' + config.escapeName(chunk.enumName)
			: config.escapeName(chunk.enumName);
		return;
	}

	if (isSQLWrapper(chunk)) {
		if (chunk.shouldOmitSQLParens?.()) {
			mergeQueryWithSQLChunk(chunk.getSQL(), config, result);
			return;
		}

		result.sql += '(';
		mergeQueryWithSQLChunk(chunk.getSQL(), config, result);
		result.sql += ')';
		return;
	}

	if (config.inlineParams) {
		result.sql += mapInlineParam(chunk, config);
		return;
	}

	result.sql += config.escapeParam(config.paramStartIndex.value++, chunk);
	result.params.push(chunk);
	addQueryTyping(result, 'none');
}

function mapInlineParam(
	chunk: unknown,
	config: BuildQueryConfig,
): string {
	if (chunk === null) {
		return 'null';
	}
	if (typeof chunk === 'number') {
		return '' + chunk;
	}
	if (typeof chunk === 'boolean') {
		return chunk ? 'true' : 'false';
	}
	if (typeof chunk === 'string') {
		return config.escapeString(chunk);
	}
	if (typeof chunk === 'object') {
		const mappedValueAsString = chunk.toString();
		return config.escapeString(
			mappedValueAsString === '[object Object]'
			? JSON.stringify(chunk)
			: mappedValueAsString
		);
	}
	throw new Error('Unexpected param value: ' + chunk);
}

export class StringChunk implements SQLWrapper {
	static readonly [entityKind]: string = 'StringChunk';

	readonly value: string[];

	constructor(value: string | string[]) {
		this.value = Array.isArray(value) ? value : [value];
	}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

export class SQL<T = unknown> implements SQLWrapper {
	static readonly [entityKind]: string = 'SQL';

	declare _: {
		brand: 'SQL';
		type: T;
	};

	/** @internal */
	decoder: DriverValueDecoder<T, any> = noopDecoder;
  	/** @internal */
	shouldInlineParams = false;

	/** @internal */
	usedTables: string[] = [];

	constructor(readonly queryChunks: SQLChunk[]) {
		for (const chunk of queryChunks) {
			if (is(chunk, Table)) {
				const schemaName = chunk[Table.Symbol.Schema];

				this.usedTables.push(
					schemaName === undefined
						? chunk[Table.Symbol.Name]
						: schemaName + '.' + chunk[Table.Symbol.Name],
				);
			}
		}
	}

	append(query: SQL): this {
		this.queryChunks.push(...query.queryChunks);
		return this;
	}

	toQuery(config: BuildQueryConfig): QueryWithTypings {
		return tracer.startActiveSpan('drizzle.buildSQL', (span) => {
			const query = this.buildQueryFromSourceParams(this.queryChunks, config);
			span?.setAttributes({
				'drizzle.query.text': query.sql,
				'drizzle.query.params': JSON.stringify(query.params),
			});
			return query;
		});
	}

	buildQueryFromSourceParams(chunks: SQLChunk[], _config: BuildQueryConfig): Query {
		const config: BuildQueryConfig = Object.assign({}, _config);
		config.inlineParams ||= this.shouldInlineParams;
		config.paramStartIndex ||= { value: 0 };

		const result: QueryWithTypings = { sql: '', params: [] };
		mergeQueryWithChunks(chunks, config as BuildQueryConfig & Required<Pick<BuildQueryConfig, "inlineParams" | "paramStartIndex">>, result);
		return result;
	}

	getSQL(): SQL {
		return this;
	}

	as(alias: string): SQL.Aliased<T>;
	/**
	 * @deprecated
	 * Use ``sql<DataType>`query`.as(alias)`` instead.
	 */
	as<TData>(): SQL<TData>;
	/**
	 * @deprecated
	 * Use ``sql<DataType>`query`.as(alias)`` instead.
	 */
	as<TData>(alias: string): SQL.Aliased<TData>;
	as(alias?: string): SQL<T> | SQL.Aliased<T> {
		// TODO: remove with deprecated overloads
		if (alias === undefined) {
			return this;
		}

		return new SQL.Aliased(this, alias);
	}

	mapWith<
		TDecoder extends
			| DriverValueDecoder<any, any>
			| DriverValueDecoder<any, any>['mapFromDriverValue'],
	>(decoder: TDecoder): SQL<GetDecoderResult<TDecoder>> {
		this.decoder = typeof decoder === 'function' ? { mapFromDriverValue: decoder } : decoder;
		return this as SQL<GetDecoderResult<TDecoder>>;
	}

	inlineParams(): this {
		this.shouldInlineParams = true;
		return this;
	}

	/**
	 * This method is used to conditionally include a part of the query.
	 *
	 * @param condition - Condition to check
	 * @returns itself if the condition is `true`, otherwise `undefined`
	 */
	if(condition: any | undefined): this | undefined {
		return condition ? this : undefined;
	}
}

export type GetDecoderResult<T> = T extends Column ? T['_']['data'] : T extends
	| DriverValueDecoder<infer TData, any>
	| DriverValueDecoder<infer TData, any>['mapFromDriverValue'] ? TData
: never;

/**
 * Any DB name (table, column, index etc.)
 */
export class Name implements SQLWrapper {
	static readonly [entityKind]: string = 'Name';

	protected brand!: 'Name';

	constructor(readonly value: string) {}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

/**
 * Any DB name (table, column, index etc.)
 * @deprecated Use `sql.identifier` instead.
 */
export function name(value: string): Name {
	return new Name(value);
}

export interface DriverValueDecoder<TData, TDriverParam> {
	mapFromDriverValue(value: TDriverParam): TData;
}

export interface DriverValueEncoder<TData, TDriverParam> {
	mapToDriverValue(value: TData): TDriverParam | SQL;
}

export function isDriverValueEncoder(value: unknown): value is DriverValueEncoder<any, any> {
	return typeof value === 'object' && value !== null && 'mapToDriverValue' in value
		&& typeof (value as any).mapToDriverValue === 'function';
}

export const noopDecoder: DriverValueDecoder<any, any> = {
	mapFromDriverValue: (value) => value,
};

export const noopEncoder: DriverValueEncoder<any, any> = {
	mapToDriverValue: (value) => value,
};

export interface DriverValueMapper<TData, TDriverParam>
	extends DriverValueDecoder<TData, TDriverParam>, DriverValueEncoder<TData, TDriverParam>
{}

export const noopMapper: DriverValueMapper<any, any> = {
	...noopDecoder,
	...noopEncoder,
};

/** Parameter value that is optionally bound to an encoder (for example, a column). */
export class Param<TDataType = unknown, TDriverParamType = TDataType> implements SQLWrapper {
	static readonly [entityKind]: string = 'Param';

	protected brand!: 'BoundParamValue';

	/**
	 * @param value - Parameter value
	 * @param encoder - Encoder to convert the value to a driver parameter
	 */
	constructor(
		readonly value: TDataType,
		readonly encoder: DriverValueEncoder<TDataType, TDriverParamType> = noopEncoder,
	) {}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

/** @deprecated Use `sql.param` instead. */
export function param<TData, TDriver>(
	value: TData,
	encoder?: DriverValueEncoder<TData, TDriver>,
): Param<TData, TDriver> {
	return new Param(value, encoder);
}

/**
 * Anything that can be passed to the `` sql`...` `` tagged function.
 */
export type SQLChunk =
	| StringChunk
	| SQLChunk[]
	| SQLWrapper
	| SQL
	| Table
	| View
	| Subquery
	| AnyColumn
	| Param
	| Name
	| undefined
	| FakePrimitiveParam
	| Placeholder;

export function sql<T>(strings: TemplateStringsArray, ...params: any[]): SQL<T>;
/*
	The type of `params` is specified as `SQLChunk[]`, but that's slightly incorrect -
	in runtime, users won't pass `FakePrimitiveParam` instances as `params` - they will pass primitive values
	which will be wrapped in `Param`. That's why the overload specifies `params` as `any[]` and not as `SQLSourceParam[]`.
	This type is used to make our lives easier and the type checker happy.
*/
export function sql(strings: TemplateStringsArray, ...params: SQLChunk[]): SQL {
	const queryChunks: SQLChunk[] = [];
	if (params.length > 0 || (strings.length > 0 && strings[0] !== '')) {
		queryChunks.push(new StringChunk(strings[0]!));
	}
	for (const [paramIndex, param] of params.entries()) {
		queryChunks.push(param, new StringChunk(strings[paramIndex + 1]!));
	}

	return new SQL(queryChunks);
}

export namespace sql {
	export function empty(): SQL {
		return new SQL([]);
	}

	/** @deprecated - use `sql.join()` */
	export function fromList(list: SQLChunk[]): SQL {
		return new SQL(list);
	}

	/**
	 * Convenience function to create an SQL query from a raw string.
	 * @param str The raw SQL query string.
	 */
	export function raw(str: string): SQL {
		return new SQL([new StringChunk(str)]);
	}

	/**
	 * Join a list of SQL chunks with a separator.
	 * @example
	 * ```ts
	 * const query = sql.join([sql`a`, sql`b`, sql`c`]);
	 * // sql`abc`
	 * ```
	 * @example
	 * ```ts
	 * const query = sql.join([sql`a`, sql`b`, sql`c`], sql`, `);
	 * // sql`a, b, c`
	 * ```
	 */
	export function join(chunks: SQLChunk[], separator?: SQLChunk): SQL {
		const result: SQLChunk[] = [];
		for (const [i, chunk] of chunks.entries()) {
			if (i > 0 && separator !== undefined) {
				result.push(separator);
			}
			result.push(chunk);
		}
		return new SQL(result);
	}

	/**
	 * Create a SQL chunk that represents a DB identifier (table, column, index etc.).
	 * When used in a query, the identifier will be escaped based on the DB engine.
	 * For example, in PostgreSQL, identifiers are escaped with double quotes.
	 *
	 * **WARNING: This function does not offer any protection against SQL injections, so you must validate any user input beforehand.**
	 *
	 * @example ```ts
	 * const query = sql`SELECT * FROM ${sql.identifier('my-table')}`;
	 * // 'SELECT * FROM "my-table"'
	 * ```
	 */
	export function identifier(value: string): Name {
		return new Name(value);
	}

	export function placeholder<TName extends string>(name: TName): Placeholder<TName> {
		return new Placeholder(name);
	}

	export function param<TData, TDriver>(
		value: TData,
		encoder?: DriverValueEncoder<TData, TDriver>,
	): Param<TData, TDriver> {
		return new Param(value, encoder);
	}
}

export namespace SQL {
	export class Aliased<T = unknown> implements SQLWrapper {
		static readonly [entityKind]: string = 'SQL.Aliased';

		declare _: {
			brand: 'SQL.Aliased';
			type: T;
		};

		/** @internal */
		isSelectionField = false;

		constructor(
			readonly sql: SQL,
			readonly fieldAlias: string,
		) {}

		getSQL(): SQL {
			return this.sql;
		}

		/** @internal */
		clone() {
			return new Aliased(this.sql, this.fieldAlias);
		}
	}
}

export class Placeholder<TName extends string = string, TValue = any> implements SQLWrapper {
	static readonly [entityKind]: string = 'Placeholder';

	declare protected: TValue;

	constructor(readonly name: TName) {}

	getSQL(): SQL {
		return new SQL([this]);
	}
}

/** @deprecated Use `sql.placeholder` instead. */
export function placeholder<TName extends string>(name: TName): Placeholder<TName> {
	return new Placeholder(name);
}

export function fillPlaceholders(params: unknown[], values: Record<string, unknown>): unknown[] {
	return params.map((p) => {
		if (is(p, Placeholder)) {
			if (!(p.name in values)) {
				throw new Error(`No value for placeholder "${p.name}" was provided`);
			}

			return values[p.name];
		}

		if (is(p, Param) && is(p.value, Placeholder)) {
			if (!(p.value.name in values)) {
				throw new Error(`No value for placeholder "${p.value.name}" was provided`);
			}

			return p.encoder.mapToDriverValue(values[p.value.name]);
		}

		return p;
	});
}

export type ColumnsSelection = Record<string, unknown>;

const IsDrizzleView = Symbol.for('drizzle:IsDrizzleView');

export abstract class View<
	TName extends string = string,
	TExisting extends boolean = boolean,
	TSelection extends ColumnsSelection = ColumnsSelection,
> implements SQLWrapper {
	static readonly [entityKind]: string = 'View';

	declare _: {
		brand: 'View';
		viewBrand: string;
		name: TName;
		existing: TExisting;
		selectedFields: TSelection;
	};

	/** @internal */
	[ViewBaseConfig]: {
		name: TName;
		originalName: TName;
		schema: string | undefined;
		selectedFields: ColumnsSelection;
		isExisting: TExisting;
		query: TExisting extends true ? undefined : SQL;
		isAlias: boolean;
	};

	/** @internal */
	[IsDrizzleView] = true;

	declare readonly $inferSelect: InferSelectViewModel<View<Assume<TName, string>, TExisting, TSelection>>;

	constructor(
		{ name, schema, selectedFields, query }: {
			name: TName;
			schema: string | undefined;
			selectedFields: ColumnsSelection;
			query: SQL | undefined;
		},
	) {
		this[ViewBaseConfig] = {
			name,
			originalName: name,
			schema,
			selectedFields,
			query: query as (TExisting extends true ? undefined : SQL),
			isExisting: !query as TExisting,
			isAlias: false,
		};
	}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

export function isView(view: unknown): view is View {
	return typeof view === 'object' && view !== null && IsDrizzleView in view;
}

export function getViewName<T extends View>(view: T): T['_']['name'] {
	return view[ViewBaseConfig].name;
}

export type InferSelectViewModel<TView extends View> =
	Equal<TView['_']['selectedFields'], { [x: string]: unknown }> extends true ? { [x: string]: unknown }
		: SelectResult<
			TView['_']['selectedFields'],
			'single',
			Record<TView['_']['name'], 'not-null'>
		>;

// Defined separately from the Column class to resolve circular dependency
Column.prototype.getSQL = function() {
	return new SQL([this]);
};

// Defined separately from the Table class to resolve circular dependency
Table.prototype.getSQL = function() {
	return new SQL([this]);
};

// Defined separately from the Column class to resolve circular dependency
Subquery.prototype.getSQL = function() {
	return new SQL([this]);
};
