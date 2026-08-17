import type { CodecsCollection } from '~/codecs.ts';
import { entityKind, is } from '~/entity.ts';
import type { SelectResult } from '~/query-builders/select.types.ts';
import { Subquery } from '~/subquery.ts';
import { TableName } from '~/table.utils.ts';
import { hasTelemetry, tracer } from '~/tracing.ts';
import type { Assume, Equal } from '~/utils.ts';
import { ViewBaseConfig } from '~/view-common.ts';
import type { AnyColumn } from '../column.ts';
import { Column } from '../column.ts';
import { IsAlias, OriginalName, Table, TableColumns, TableSchema } from '../table.ts';

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
	escapeName(name: string): string;
	escapeParam(num: number, value: unknown): string;
	escapeString(str: string): string;
	codecs?: CodecsCollection;
	paramStartIndex?: { value: number };
	inlineParams?: boolean;
	invokeSource?: 'indexes' | 'mssql-check' | 'mssql-view-with-schemabinding' | undefined;
	tagged?: true;
}

export interface Query {
	sql: string;
	params: unknown[];
	_sql?: TemplateStringsArray;
	// ^ TODO: revisit
	// for Bun.SQL cache performance
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
export interface SQLWrapper<T = unknown> {
	getSQL(): SQL<T>;
	shouldOmitSQLParens?(): boolean;
}

export function isSQLWrapper(value: unknown): value is SQLWrapper {
	return value !== null && value !== undefined && typeof (value as any).getSQL === 'function';
}

export class StringChunk implements SQLWrapper {
	static readonly [entityKind]: string = 'StringChunk';

	constructor(readonly value: string) {}

	getSQL(): SQL<unknown> {
		return new SQL([this]);
	}
}

export class SQL<T = unknown> implements SQLWrapper<T> {
	static readonly [entityKind]: string = 'SQL';

	declare _: {
		brand: 'SQL';
		type: T;
	};

	/** @internal */
	decoder: DriverValueDecoder<T, any> = noopDecoder;
	/** @internal */
	public shouldInlineParams = false;

	/** @internal */
	private _usedTables: string[] | undefined;
	/** @internal */
	get usedTables(): string[] {
		if (this._usedTables) return this._usedTables;
		this._usedTables = [];

		for (let i = 0; i < this.queryChunks.length; ++i) {
			const chunk = this.queryChunks[i]!;
			if (is(chunk, Table)) {
				const schemaName = chunk[Table.Symbol.Schema];

				this._usedTables.push(
					schemaName === undefined
						? chunk[Table.Symbol.Name]
						: schemaName + '.' + chunk[Table.Symbol.Name],
				);
			}
		}
		return this._usedTables;
	}

	constructor(readonly queryChunks: SQLChunk[]) {}

	append(query: SQL): this {
		this.queryChunks.push(...query.queryChunks);
		return this;
	}

	toQuery(config: BuildQueryConfig): Query {
		if (!hasTelemetry) return this.buildQueryFromSourceParams(this.queryChunks, config);

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
		const strings: string[] = [];
		const params: unknown[] = [];
		const bounds: number[] | undefined = _config.tagged ? [] : undefined;

		this.collectSQL(
			chunks,
			_config,
			_config.paramStartIndex || { value: 0 },
			_config.inlineParams || this.shouldInlineParams,
			strings,
			params,
			bounds,
		);

		if (bounds === undefined) {
			return {
				sql: strings.join(''),
				params,
			} as Query;
		}

		const segments: string[] = new Array(bounds.length);
		for (let i = 0; i < bounds.length; ++i) {
			const end = i + 1 < bounds.length ? bounds[i + 1]! : strings.length;
			let segment = '';
			for (let j = bounds[i]!; j < end; ++j) segment += strings[j];
			segments[i] = segment;
		}

		return {
			sql: strings.join(''),
			params,
			_sql: Object.assign(segments, { raw: segments }),
		} as Query;
	}

	private collectSQL(
		chunks: SQLChunk[],
		config: BuildQueryConfig,
		paramStartIndex: { value: number },
		inlineParams: boolean,
		strings: string[],
		params: unknown[],
		bounds: number[] | undefined,
	): void {
		const {
			escapeName,
			escapeParam,
			codecs,
			invokeSource,
		} = config;

		for (let i = 0; i < chunks.length; ++i) {
			if (bounds !== undefined) bounds.push(strings.length);

			const chunk = chunks[i]!;

			if (is(chunk, StringChunk)) {
				strings.push(chunk.value);
				continue;
			}

			if (is(chunk, SQL)) {
				this.collectSQL(
					chunk.queryChunks,
					config,
					paramStartIndex,
					inlineParams || chunk.shouldInlineParams,
					strings,
					params,
					undefined,
				);
				continue;
			}

			if (is(chunk, Name)) {
				strings.push(escapeName(chunk.value));
				continue;
			}

			if (chunk === undefined) {
				continue;
			}

			if (is(chunk, Column)) {
				const columnName = chunk.name;
				if (invokeSource === 'indexes') {
					strings.push(escapeName(columnName));
					continue;
				}

				const schemaName = invokeSource === 'mssql-check' ? undefined : chunk.table[Table.Symbol.Schema];
				strings.push(
					chunk.isAlias ? escapeName(chunk.name) : chunk.table[IsAlias] || schemaName === undefined
						? escapeName(chunk.table[Table.Symbol.Name]) + '.' + escapeName(columnName)
						: escapeName(schemaName) + '.' + escapeName(chunk.table[Table.Symbol.Name]) + '.'
							+ escapeName(columnName),
				);
				continue;
			}

			if (is(chunk, Param)) {
				if (is(chunk.value, SQL)) {
					const nested = chunk.value;
					this.collectSQL(
						nested.queryChunks,
						config,
						paramStartIndex,
						inlineParams || nested.shouldInlineParams,
						strings,
						params,
						undefined,
					);
					continue;
				}

				const useCodecs = codecs && is(chunk.encoder, Column);

				if (is(chunk.value, Placeholder)) {
					const escaped = escapeParam(paramStartIndex.value++, chunk);
					chunk.codec = useCodecs
						? (value) => codecs.apply(chunk.encoder as Column, 'normalizeParam', value)
						: undefined;
					strings.push(
						useCodecs
							? codecs.apply(chunk.encoder, 'castParam', escaped)
							: escaped,
					);
					params.push(chunk);
					continue;
				}

				let mappedValue: any;
				if (chunk.value === null) {
					mappedValue = chunk.value;
				} else {
					mappedValue = chunk.encoder.mapToDriverValue.isNoop
						? chunk.value
						: chunk.encoder.mapToDriverValue(chunk.value);

					if (is(mappedValue, SQL)) {
						const nested: SQL = mappedValue;
						this.collectSQL(
							nested.queryChunks,
							config,
							paramStartIndex,
							inlineParams || nested.shouldInlineParams,
							strings,
							params,
							undefined,
						);
						continue;
					}

					if (useCodecs) {
						mappedValue = codecs.apply(
							chunk.encoder,
							'normalizeParam',
							mappedValue,
						);
					}
				}

				if (inlineParams) {
					strings.push(this.mapInlineParam(mappedValue, config));
					continue;
				}

				const escaped = escapeParam(paramStartIndex.value++, mappedValue);
				strings.push(
					useCodecs
						? codecs.apply(chunk.encoder, 'castParam', escaped)
						: escaped,
				);
				params.push(mappedValue);
				continue;
			}

			if (is(chunk, Placeholder)) {
				strings.push(escapeParam(paramStartIndex.value++, chunk));
				params.push(chunk);
				continue;
			}

			if (is(chunk, Table)) {
				const schemaName = chunk[Table.Symbol.Schema];
				const tableName = chunk[Table.Symbol.Name];

				if (invokeSource === 'mssql-view-with-schemabinding') {
					strings.push(
						(schemaName === undefined ? escapeName('dbo') : escapeName(schemaName)) + '.'
							+ escapeName(tableName),
					);
					continue;
				}

				strings.push(
					schemaName === undefined || chunk[IsAlias]
						? escapeName(tableName)
						: escapeName(schemaName) + '.' + escapeName(tableName),
				);
				continue;
			}

			if (is(chunk, View)) {
				const schemaName = chunk[ViewBaseConfig].schema;
				const viewName = chunk[ViewBaseConfig].name;
				strings.push(
					schemaName === undefined || chunk[ViewBaseConfig].isAlias
						? escapeName(viewName)
						: escapeName(schemaName) + '.' + escapeName(viewName),
				);
				continue;
			}

			if (is(chunk, SQL.Aliased) && chunk.fieldAlias !== undefined) {
				strings.push(
					(chunk.origin !== undefined ? escapeName(chunk.origin) + '.' : '') + escapeName(chunk.fieldAlias),
				);
				continue;
			}

			if (is(chunk, Subquery)) {
				if (chunk._.isWith) {
					strings.push(escapeName(chunk._.alias));
					continue;
				}

				const nested = chunk._.sql;
				strings.push('(');
				this.collectSQL(
					nested.queryChunks,
					config,
					paramStartIndex,
					inlineParams || nested.shouldInlineParams,
					strings,
					params,
					undefined,
				);
				strings.push(') ' + escapeName(chunk._.alias));
				continue;
			}

			if (typeof chunk === 'function' && 'enumName' in chunk) {
				if ('schema' in chunk && chunk.schema) {
					strings.push(escapeName(chunk.schema as string) + '.' + escapeName(chunk.enumName as string));
					continue;
				}
				strings.push(escapeName(chunk.enumName as string));
				continue;
			}

			if (isSQLWrapper(chunk)) {
				const nested = chunk.getSQL();
				const nestedInlineParams = inlineParams || nested.shouldInlineParams;

				if (chunk.shouldOmitSQLParens?.()) {
					this.collectSQL(
						nested.queryChunks,
						config,
						paramStartIndex,
						nestedInlineParams,
						strings,
						params,
						undefined,
					);
					continue;
				}

				strings.push('(');
				this.collectSQL(
					nested.queryChunks,
					config,
					paramStartIndex,
					nestedInlineParams,
					strings,
					params,
					undefined,
				);
				strings.push(')');
				continue;
			}

			if (Array.isArray(chunk)) {
				strings.push('(');
				const element: SQLChunk[] = [undefined];
				for (let j = 0; j < chunk.length; ++j) {
					if (j > 0) strings.push(', ');
					element[0] = chunk[j];
					this.collectSQL(element, config, paramStartIndex, inlineParams, strings, params, undefined);
				}
				strings.push(')');
				continue;
			}

			if (inlineParams) {
				strings.push(this.mapInlineParam(chunk, config));
				continue;
			}

			strings.push(escapeParam(paramStartIndex.value++, chunk));
			params.push(chunk);
		}
	}

	private mapInlineParam(
		chunk: unknown,
		{ escapeString }: BuildQueryConfig,
	): string {
		if (chunk === null) {
			return 'null';
		}
		if (typeof chunk === 'number' || typeof chunk === 'boolean' || typeof chunk === 'bigint') {
			return chunk.toString();
		}
		if (typeof chunk === 'string') {
			return escapeString(chunk);
		}
		if (typeof chunk === 'object') {
			const mappedValueAsString = chunk.toString();
			if (mappedValueAsString === '[object Object]') {
				return escapeString(JSON.stringify(chunk));
			}
			return escapeString(mappedValueAsString);
		}
		throw new Error('Unexpected param value: ' + chunk);
	}

	getSQL(): SQL<T> {
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
			| DriverValueDecoder<any, Exclude<T, null>>
			| DriverValueDecoder<any, Exclude<T, null>>['mapFromDriverValue'],
	>(
		decoder: TDecoder,
	): Equal<T, unknown> extends true ? SQL<GetDecoderResult<TDecoder>>
		: Equal<T, any> extends true ? SQL<GetDecoderResult<TDecoder>>
		: SQL<GetDecoderResult<TDecoder> | (null extends T ? null : never)>
	{
		this.decoder = typeof decoder === 'function' ? { mapFromDriverValue: decoder } : decoder;
		return this as SQL<any>;
	}

	nullable(): SQL<T | null> {
		return this;
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

export interface DriverValueDecoderFn<TData, TDriverParam> {
	(value: TDriverParam): TData;
	/** @internal */
	isNoop?: true | undefined;
}

export interface DriverValueDecoder<TData, TDriverParam> {
	mapFromDriverValue: DriverValueDecoderFn<TData, TDriverParam>;
}

export interface DriverValueEncoderFn<TData, TDriverParam> {
	(value: TData): TDriverParam;
	/** @internal */
	isNoop?: true | undefined;
}

export interface DriverValueEncoder<TData, TDriverParam> {
	mapToDriverValue: DriverValueEncoderFn<TData, TDriverParam>;
}

export function isDriverValueEncoder(value: unknown): value is DriverValueEncoder<any, any> {
	return typeof value === 'object' && value !== null && 'mapToDriverValue' in value
		&& typeof (value as any).mapToDriverValue === 'function';
}

export const noopDecoder: DriverValueDecoder<any, any> = {
	mapFromDriverValue: (value) => value,
};

noopDecoder.mapFromDriverValue.isNoop = true;

export const noopEncoder: DriverValueEncoder<any, any> = {
	mapToDriverValue: (value) => value,
};

noopEncoder.mapToDriverValue.isNoop = true;

export interface DriverValueMapper<TData, TDriverParam>
	extends DriverValueDecoder<TData, TDriverParam>, DriverValueEncoder<TData, TDriverParam>
{}

export function isNoop(mapper: DriverValueEncoderFn<any, any> | DriverValueDecoderFn<any, any>) {
	return mapper.isNoop;
}

export const noopMapper: DriverValueMapper<any, any> = {
	...noopDecoder,
	...noopEncoder,
};

/** Parameter value that is optionally bound to an encoder (for example, a column). */
export class Param<TDataType = any, TDriverParamType = TDataType> implements SQLWrapper {
	static readonly [entityKind]: string = 'Param';

	protected brand!: 'BoundParamValue';

	/**
	 * @param value - Parameter value
	 * @param encoder - Encoder to convert the value to a driver parameter
	 */
	constructor(
		readonly value: TDataType | Placeholder<string, TDataType>,
		readonly encoder: DriverValueEncoder<TDataType, TDriverParamType> = noopEncoder,
		public codec?: (value: any) => any,
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

export type SQLGenerator<T = unknown> = typeof sql<T>;

export function sql<T>(strings: TemplateStringsArray, ...params: any[]): SQL<T>;
/*
	The type of `params` is specified as `SQLChunk[]`, but that's slightly incorrect -
	in runtime, users won't pass `FakePrimitiveParam` instances as `params` - they will pass primitive values
	which will be wrapped in `Param`. That's why the overload specifies `params` as `any[]` and not as `SQLSourceParam[]`.
	This type is used to make our lives easier and the type checker happy.
*/
export function sql(strings: TemplateStringsArray, ...params: SQLChunk[]): SQL {
	const startWithString = params.length > 0 || (strings.length > 0 && strings[0] !== '');
	const chunkCount = startWithString ? strings.length + params.length : strings.length - 1;
	const queryChunks: SQLChunk[] = new Array(chunkCount < 0 ? 0 : chunkCount);

	let writeIdx = 0;
	if (startWithString) {
		queryChunks[writeIdx++] = new StringChunk(strings[0]!);
	}
	for (let paramIdx = 0; paramIdx < params.length; ++paramIdx) {
		const param = params[paramIdx]!;
		queryChunks[writeIdx++] = param;
		queryChunks[writeIdx++] = new StringChunk(strings[paramIdx + 1]!);
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
		const { length } = chunks;
		if (separator === undefined || length === 0) return new SQL(chunks.slice());

		const result: SQLChunk[] = new Array(length * 2 - 1);
		for (let i = 0, writeIdx = 0; i < length; ++i) {
			result[writeIdx++] = chunks[i];

			if (i < length - 1) {
				result[writeIdx++] = separator;
			}
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
		value: TData | Placeholder<string, TData>,
		encoder?: DriverValueEncoder<TData, TDriver>,
	): Param<TData, TDriver> {
		return new Param(value, encoder);
	}

	/**
	 * Attach [sqlcommenter](https://google.github.io/sqlcommenter) comment to a query
	 */
	export function comment(input: CommentInput): SQL | undefined {
		const encoded = sqlCommenter(input);
		if (!encoded.length) return undefined;

		return sql.raw(encoded);
	}
}

export function sqlCommenter(input: CommentInput): string {
	const encoded = sqlCommenter.encodeInput(input);
	if (!encoded.length) return '';

	return `/*${encoded}*/`;
}

export namespace sqlCommenter {
	export function merge(input1: CommentInput | undefined, input2: CommentInput | undefined) {
		let encoded: CommentInput;
		if (typeof input1 === 'object' && typeof input2 === 'object') {
			encoded = encodeInput({ ...input1, ...input2 });
		} else if (input1 && input2) {
			encoded = [encodeInput(input1), encodeInput(input2)].filter((i) => i.length).join(',');
		} else if (input2) {
			encoded = encodeInput(input2);
		} else if (input1) {
			encoded = encodeInput(input1);
		} else {
			return '';
		}

		if (!encoded.length) return '';

		return `/*${encoded}*/`;
	}

	export function encodeInput(input: CommentInput): string {
		if (typeof input === 'string') {
			if (!input.length) return input;

			return sanitizeStringInput(input);
		}

		const parts: string[] = [];

		for (const [key, value] of Object.entries(input)) {
			if (value === null || value === undefined || value === '') continue;

			const encodedKey = sanitizeObjectElement(key);
			const encodedValue = sanitizeObjectElement(String(value));

			parts.push(`${encodedKey}='${encodedValue}'`);
		}

		if (!parts.length) return '';

		return parts.sort().join(',');
	}

	export function sanitizeObjectElement(key: string): string {
		const urlEncoded = encodeURIComponent(key);
		return urlEncoded.replace(/'/g, `\\'`);
	}

	export function sanitizeStringInput(input: string): string {
		return input.replace(/\/\*/g, '/ *').replace(/\*\//g, '* /');
	}
}

export type CommentInput = string | SqlCommenterInput;

export type SqlCommenterInput = Record<
	string,
	string | number | bigint | boolean | null | undefined
>;

export namespace SQL {
	export class Aliased<T = unknown> implements SQLWrapper<T> {
		static readonly [entityKind]: string = 'SQL.Aliased';

		declare _: {
			brand: 'SQL.Aliased';
			type: T;
		};

		/** @internal */
		isSelectionField = false;
		/** @internal */
		origin?: string;

		constructor(
			readonly sql: SQL<T>,
			readonly fieldAlias: string,
		) {}

		getSQL(): SQL<T> {
			return this.sql as SQL<T>;
		}

		/** @internal */
		clone() {
			return new Aliased<T>(this.sql, this.fieldAlias);
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

			const value = values[p.value.name];
			if (value === null) return value;

			const mapped = p.encoder.mapToDriverValue.isNoop
				? value
				: p.encoder.mapToDriverValue(value);

			return p.codec ? p.codec(mapped) : mapped;
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
> {
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

	/** @internal */
	public get [TableName]() {
		return this[ViewBaseConfig].name;
	}

	/** @internal */
	public get [TableSchema]() {
		return this[ViewBaseConfig].schema;
	}

	/** @internal */
	public get [IsAlias]() {
		return this[ViewBaseConfig].isAlias;
	}

	/** @internal */
	public get [OriginalName]() {
		return this[ViewBaseConfig].originalName;
	}

	/** @internal */
	public get [TableColumns]() {
		return (this[ViewBaseConfig].selectedFields) as any as Record<string, unknown>;
	}

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
// Defined separately from the Subquery class to resolve circular dependency
Subquery.prototype.getSQL = function() {
	return new SQL([this]);
};

export type SQLEntity = SQL | SQLWrapper | SQL.Aliased | Table | View;
