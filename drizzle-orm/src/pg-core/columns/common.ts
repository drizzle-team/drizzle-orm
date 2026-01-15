import type { ColumnType, GeneratedColumnConfig, GeneratedIdentityConfig } from '~/column-builder.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { ForeignKey, UpdateDeleteAction } from '~/pg-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/pg-core/foreign-keys.ts';
import type { AnyPgTable, PgTable } from '~/pg-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import { iife } from '~/tracing-utils.ts';
import type { Update } from '~/utils.ts';
import type { PgIndexOpClass } from '../indexes.ts';
import { makePgArray, parsePgArray } from '../utils/array.ts';

declare const PgColumnBuilderBrand: unique symbol;
export type PgColumnBuilderBrand = typeof PgColumnBuilderBrand;

declare const PgColumnBrand: unique symbol;
export type PgColumnBrand = typeof PgColumnBrand;

export type PgArrayDimension = 0 | 1 | 2 | 3 | 4 | 5;
type PgArrayDimensionString = '[]' | '[][]' | '[][][]' | '[][][][]' | '[][][][][]';

type ArrayDimensionStringToNumber<T extends PgArrayDimensionString> = T extends '[]' ? 1
	: T extends '[][]' ? 2
	: T extends '[][][]' ? 3
	: T extends '[][][][]' ? 4
	: T extends '[][][][][]' ? 5
	: never;

export interface PgColumnBuilderConfig {
	dataType: ColumnType;
	data: unknown;
	driverParam: unknown;
	// Optional - set via chain methods
	notNull?: boolean;
	hasDefault?: boolean;
	isPrimaryKey?: boolean;
	isAutoincrement?: boolean;
	hasRuntimeDefault?: boolean;
	enumValues?: string[];
	identity?: 'always' | 'byDefault';
	generated?: unknown;
	dimensions?: PgArrayDimension;
	$type?: unknown;
}

export interface PgColumnBuilderRuntimeConfig<TData> {
	name: string;
	keyAsName: boolean;
	notNull: boolean;
	default: TData | SQL | undefined;
	defaultFn: (() => TData | SQL) | undefined;
	onUpdateFn: (() => TData | SQL) | undefined;
	hasDefault: boolean;
	primaryKey: boolean;
	isUnique: boolean;
	uniqueName: string | undefined;
	uniqueType: string | undefined;
	dataType: string;
	columnType: string;
	generated: GeneratedColumnConfig<TData> | undefined;
	generatedIdentity: GeneratedIdentityConfig | undefined;
	dimensions?: PgArrayDimension;
}

// TODO: remove isAutoincrement and hasRuntimeDefault
export interface PgColumnBaseConfig<out TDataType extends ColumnType = ColumnType> {
	name: string;
	dataType: TDataType;
	tableName: string;
	notNull: boolean;
	hasDefault: boolean;
	isPrimaryKey: boolean;
	isAutoincrement: boolean;
	hasRuntimeDefault: boolean;
	data: unknown;
	driverParam: unknown;
	enumValues: string[] | undefined;
	generated: unknown;
	identity: undefined | 'always' | 'byDefault';
	// insertType: unknown;
}

type WrapArray<T, N extends number> = N extends 1 ? T[]
	: N extends 2 ? T[][]
	: N extends 3 ? T[][][]
	: N extends 4 ? T[][][][]
	: N extends 5 ? T[][][][][]
	: T;

export type SetNotNull<T> = T & { readonly [PgColumnBuilderBrand]: { notNull: true } };
export type SetHasDefault<T> = T & { readonly [PgColumnBuilderBrand]: { hasDefault: true } };
export type SetIsPrimaryKey<T> = T & { readonly [PgColumnBuilderBrand]: { isPrimaryKey: true; notNull: true } };
export type SetHasRuntimeDefault<T> = T & {
	readonly [PgColumnBuilderBrand]: { hasRuntimeDefault: true; hasDefault: true };
};
export type Set$Type<T, TType> = T & { readonly [PgColumnBuilderBrand]: { $type: TType } };
export type SetHasGenerated<T> = T & {
	readonly [PgColumnBuilderBrand]: { hasDefault: true; generated: true };
};
export type SetDimensions<T, TDim extends PgArrayDimension> = T & {
	readonly [PgColumnBuilderBrand]: { dimensions: TDim };
};
export type SetIdentity<T, TType extends 'always' | 'byDefault'> = T & {
	readonly [PgColumnBuilderBrand]: { notNull: true; hasDefault: true; identity: TType };
};

export type HasIdentity<T, TType extends 'always' | 'byDefault'> = SetIdentity<T, TType>;

type GetBaseData<T> = T extends { $type: infer U } ? U : T extends { data: infer D } ? D : unknown;

export type ResolvePgColumnConfig<
	out T extends PgColumnBuilderConfig,
	out TTableName extends string,
	out TData extends unknown = T['dimensions'] extends 1 | 2 | 3 | 4 | 5 ? WrapArray<GetBaseData<T>, T['dimensions']>
		: GetBaseData<T>,
> = {
	name: string;
	tableName: TTableName;
	dataType: T['dataType'];
	data: TData;
	driverParam: T['dimensions'] extends 1 | 2 | 3 | 4 | 5 ? WrapArray<T['driverParam'], T['dimensions']> | string
		: T['driverParam'];
	notNull: T['notNull'] extends true ? true : false;
	hasDefault: T['hasDefault'] extends true ? true : false;
	isPrimaryKey: false;
	isAutoincrement: false;
	hasRuntimeDefault: false;
	enumValues: T extends { enumValues: infer E extends string[] } ? E : undefined;
	identity: T['identity'] extends 'always' | 'byDefault' ? T['identity'] : undefined;
	generated: T['generated'] extends true ? true : undefined;
	// insertType: T['generated'] extends true ? never
	// 	: T['identity'] extends 'always' ? never
	// 	: T['notNull'] extends true ? T['hasDefault'] extends true ? TData | undefined : TData
	// 	: TData | null | undefined;
} & {};

export interface AnyPgColumnBuilder {
	readonly [PgColumnBuilderBrand]: PgColumnBuilderConfig;
}

export interface AnyPostgresColumn {
	readonly [PgColumnBrand]: PgColumnBaseConfig;
}

export type PgBuildColumn<
	TTableName extends string,
	TBuilder extends AnyPgColumnBuilder,
	TBuiltConfig extends PgColumnBaseConfig<ColumnType> = ResolvePgColumnConfig<
		TBuilder[PgColumnBuilderBrand],
		TTableName
	>,
> = PgColumn<ColumnType, TBuiltConfig, {}>;

export type PgBuildColumns<
	out TTableName extends string,
	out TConfigMap extends Record<string, AnyPgColumnBuilder>,
> =
	& {
		[Key in keyof TConfigMap]: PgBuildColumn<TTableName, TConfigMap[Key]>;
	}
	& {};

export type PgBuildExtraConfigColumns<
	out TConfigMap extends Record<string, AnyPgColumnBuilder>,
> =
	& {
		[Key in keyof TConfigMap]: ExtraConfigColumn;
	}
	& {};

export type PgColumns = Record<string, PgColumn>;

export interface ReferenceConfig {
	ref: () => PgColumn;
	config: {
		name?: string;
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class PgColumnBuilder<
	out T extends PgColumnBuilderConfig = PgColumnBuilderConfig,
	out TRuntimeConfig extends object = object,
> {
	static readonly [entityKind]: string = 'PgColumnBuilder';

	declare readonly [PgColumnBuilderBrand]: T;

	private foreignKeyConfigs: ReferenceConfig[] = [];

	protected config: PgColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;

	constructor(name: string, dataType: ColumnType, columnType: string) {
		this.config = {
			name,
			keyAsName: name === '',
			notNull: false,
			default: undefined,
			hasDefault: false,
			primaryKey: false,
			isUnique: false,
			uniqueName: undefined,
			uniqueType: undefined,
			dataType,
			columnType,
			generated: undefined,
			defaultFn: undefined,
			onUpdateFn: undefined,
			generatedIdentity: undefined,
		} as PgColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;
	}

	/**
	 * Changes the data type of the column. Commonly used with `json` columns. Also, useful for branded types.
	 *
	 * @example
	 * ```ts
	 * const users = pgTable('users', {
	 * 	id: integer('id').$type<UserId>().primaryKey(),
	 * 	details: json('details').$type<UserDetails>().notNull(),
	 * });
	 * ```
	 */
	$type<TType>(): Set$Type<this, TType> {
		return this as Set$Type<this, TType>;
	}

	/**
	 * Adds a `not null` clause to the column definition.
	 *
	 * Affects the `select` model of the table - columns *without* `not null` will be nullable on select.
	 */
	notNull(): SetNotNull<this> {
		this.config.notNull = true;
		return this as SetNotNull<this>;
	}

	/**
	 * Adds a `default <value>` clause to the column definition.
	 *
	 * Affects the `insert` model of the table - columns *with* `default` are optional on insert.
	 *
	 * If you need to set a dynamic default value, use {@link $defaultFn} instead.
	 */
	default(
		value:
			| (this[PgColumnBuilderBrand] extends { dimensions: 1 | 2 | 3 | 4 | 5 } ? WrapArray<
					this[PgColumnBuilderBrand] extends { $type: infer U } ? U : this[PgColumnBuilderBrand]['data'],
					this[PgColumnBuilderBrand]['dimensions']
				>
				: this[PgColumnBuilderBrand] extends { $type: infer U } ? U
				: this[PgColumnBuilderBrand]['data'])
			| SQL,
	): SetHasDefault<this> {
		this.config.default = value;
		this.config.hasDefault = true;
		return this as SetHasDefault<this>;
	}

	/**
	 * Adds a dynamic default value to the column.
	 * The function will be called when the row is inserted, and the returned value will be used as the column value.
	 *
	 * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
	 */
	$defaultFn(
		fn: () =>
			| (this[PgColumnBuilderBrand] extends { dimensions: 1 | 2 | 3 | 4 | 5 } ? WrapArray<
					this[PgColumnBuilderBrand] extends { $type: infer U } ? U : this[PgColumnBuilderBrand]['data'],
					this[PgColumnBuilderBrand]['dimensions']
				>
				: this[PgColumnBuilderBrand] extends { $type: infer U } ? U
				: this[PgColumnBuilderBrand]['data'])
			| SQL,
	): SetHasRuntimeDefault<this> {
		this.config.defaultFn = fn;
		this.config.hasDefault = true;
		return this as SetHasRuntimeDefault<this>;
	}

	/**
	 * Alias for {@link $defaultFn}.
	 */
	$default = this.$defaultFn;

	/**
	 * Adds a dynamic update value to the column.
	 * The function will be called when the row is updated, and the returned value will be used as the column value if none is provided.
	 * If no `default` (or `$defaultFn`) value is provided, the function will be called when the row is inserted as well, and the returned value will be used as the column value.
	 *
	 * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
	 */
	$onUpdateFn(
		fn: () =>
			| (this[PgColumnBuilderBrand] extends { dimensions: 1 | 2 | 3 | 4 | 5 } ? WrapArray<
					this[PgColumnBuilderBrand] extends { $type: infer U } ? U : this[PgColumnBuilderBrand]['data'],
					this[PgColumnBuilderBrand]['dimensions']
				>
				: this[PgColumnBuilderBrand] extends { $type: infer U } ? U
				: this[PgColumnBuilderBrand]['data'])
			| SQL,
	): SetHasDefault<this> {
		this.config.onUpdateFn = fn;
		this.config.hasDefault = true;
		return this as SetHasDefault<this>;
	}

	/**
	 * Alias for {@link $onUpdateFn}.
	 */
	$onUpdate = this.$onUpdateFn;

	/**
	 * Adds a `primary key` clause to the column definition. This implicitly makes the column `not null`.
	 *
	 * In SQLite, `integer primary key` implicitly makes the column auto-incrementing.
	 */
	primaryKey(): SetIsPrimaryKey<this> {
		this.config.primaryKey = true;
		this.config.notNull = true;
		return this as SetIsPrimaryKey<this>;
	}

	/** @internal Sets the name of the column to the key within the table definition if a name was not given. */
	setName(name: string) {
		if (this.config.name !== '') return;
		this.config.name = name;
	}

	/**
	 * Makes this column a PostgreSQL array column.
	 *
	 * @example
	 * ```ts
	 * const t = pgTable('t', {
	 *   // 1D array: number[]
	 *   tags: integer().array(),
	 *   // Or explicitly: integer().array('[]')
	 *   // 2D array: number[][]
	 *   matrix: integer().array('[][]'),
	 * });
	 * ```
	 */
	array(): SetDimensions<this, 1>;
	array<TDim extends PgArrayDimensionString>(
		dimensions: TDim,
	): SetDimensions<this, ArrayDimensionStringToNumber<TDim>>;
	array<TDim extends PgArrayDimensionString>(
		dimensions?: TDim,
	): SetDimensions<this, ArrayDimensionStringToNumber<TDim>> {
		// Calculate dimensions as number from string notation
		const dim = dimensions ?? '[]';
		(this.config as any).dimensions = (dim.length / 2) as PgArrayDimension;
		return this as SetDimensions<this, ArrayDimensionStringToNumber<TDim>>;
	}

	references(
		ref: ReferenceConfig['ref'],
		config: ReferenceConfig['config'] = {},
	): this {
		this.foreignKeyConfigs.push({ ref, config });
		return this;
	}

	unique(
		name?: string,
		config?: { nulls: 'distinct' | 'not distinct' },
	): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		this.config.uniqueType = config?.nulls;
		return this;
	}

	generatedAlwaysAs(
		as:
			| (this[PgColumnBuilderBrand] extends { dimensions: 1 | 2 | 3 | 4 | 5 } ? WrapArray<
					this[PgColumnBuilderBrand] extends { $type: infer U } ? U : this[PgColumnBuilderBrand]['data'],
					this[PgColumnBuilderBrand]['dimensions']
				>
				: this[PgColumnBuilderBrand] extends { $type: infer U } ? U
				: this[PgColumnBuilderBrand]['data'])
			| SQL
			| (() => SQL),
	): SetHasGenerated<this> {
		this.config.generated = {
			as,
			type: 'always',
			mode: 'stored',
		};
		return this as SetHasGenerated<this>;
	}

	/** @internal */
	buildForeignKeys(column: PgColumn, table: PgTable): ForeignKey[] {
		return this.foreignKeyConfigs.map(({ ref, config }) => {
			return iife(
				(ref, config) => {
					const builder = new ForeignKeyBuilder(() => {
						const foreignColumn = ref();
						return { name: config.name, columns: [column], foreignColumns: [foreignColumn] };
					});
					if (config.onUpdate) {
						builder.onUpdate(config.onUpdate);
					}
					if (config.onDelete) {
						builder.onDelete(config.onDelete);
					}
					return builder.build(table);
				},
				ref,
				config,
			);
		});
	}

	/** @internal */
	abstract build(table: PgTable): PgColumn<any>;

	/** @internal */
	buildExtraConfigColumn<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): ExtraConfigColumn {
		return new ExtraConfigColumn(table, { ...this.config, dimensions: (this.config as any).dimensions ?? 0 });
	}
}

// TODO: we should potenitally do column to be
// in charge of map value/array of values/json value and json array of values in 1 place
export abstract class PgColumn<
	out TColumnType extends ColumnType = any,
	out T extends PgColumnBaseConfig<TColumnType> = PgColumnBaseConfig<TColumnType>,
	out TRuntimeConfig extends object = {},
> extends Column<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'PgColumn';

	/** @internal */
	override readonly table: PgTable;

	readonly dimensions: PgArrayDimension;

	constructor(
		table: PgTable,
		config: PgColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig,
	) {
		super(table, config);
		this.table = table;
		this.dimensions = config.dimensions ?? 0;

		// Wrap mapFromDriverValue/mapToDriverValue with array handling if this is an array column
		if (this.dimensions) {
			const originalFromDriver = this.mapFromDriverValue.bind(this);
			const originalToDriver = this.mapToDriverValue.bind(this);

			this.mapFromDriverValue = (value: unknown): unknown => {
				if (value === null) return value;
				// Parse string representation if needed (e.g., from node-postgres for enum arrays)
				const arr = typeof value === 'string' ? parsePgArray(value) : value as unknown[];
				return this.mapArrayElements(arr, originalFromDriver, this.dimensions);
			};

			this.mapToDriverValue = (value: unknown): unknown => {
				if (value === null) return value;
				const mapped = this.mapArrayElements(value as unknown[], originalToDriver, this.dimensions);
				return makePgArray(mapped as any[]);
			};
		}
	}

	/** @internal */
	private mapArrayElements(value: unknown, mapper: (v: unknown) => unknown, depth: number): unknown {
		if (depth > 0 && Array.isArray(value)) {
			return value.map((v) => v === null ? null : this.mapArrayElements(v, mapper, depth - 1));
		}
		return mapper(value);
	}
}

export type IndexedExtraConfigType = { order?: 'asc' | 'desc'; nulls?: 'first' | 'last'; opClass?: string };

export class ExtraConfigColumn<
	out T extends PgColumnBaseConfig<ColumnType> = PgColumnBaseConfig<ColumnType>,
> extends PgColumn<ColumnType, T, IndexedExtraConfigType> {
	static override readonly [entityKind]: string = 'ExtraConfigColumn';

	override getSQLType(): string {
		return this.getSQLType();
	}

	indexConfig: IndexedExtraConfigType = {
		order: this.config.order ?? 'asc',
		nulls: this.config.nulls ?? 'last',
		opClass: this.config.opClass,
	};
	defaultConfig: IndexedExtraConfigType = {
		order: 'asc',
		nulls: 'last',
		opClass: undefined,
	};

	asc(): Omit<this, 'asc' | 'desc'> {
		this.indexConfig.order = 'asc';
		return this;
	}

	desc(): Omit<this, 'asc' | 'desc'> {
		this.indexConfig.order = 'desc';
		return this;
	}

	nullsFirst(): Omit<this, 'nullsFirst' | 'nullsLast'> {
		this.indexConfig.nulls = 'first';
		return this;
	}

	nullsLast(): Omit<this, 'nullsFirst' | 'nullsLast'> {
		this.indexConfig.nulls = 'last';
		return this;
	}

	/**
	 * ### PostgreSQL documentation quote
	 *
	 * > An operator class with optional parameters can be specified for each column of an index.
	 * The operator class identifies the operators to be used by the index for that column.
	 * For example, a B-tree index on four-byte integers would use the int4_ops class;
	 * this operator class includes comparison functions for four-byte integers.
	 * In practice the default operator class for the column's data type is usually sufficient.
	 * The main point of having operator classes is that for some data types, there could be more than one meaningful ordering.
	 * For example, we might want to sort a complex-number data type either by absolute value or by real part.
	 * We could do this by defining two operator classes for the data type and then selecting the proper class when creating an index.
	 * More information about operator classes check:
	 *
	 * ### Useful links
	 * https://www.postgresql.org/docs/current/sql-createindex.html
	 *
	 * https://www.postgresql.org/docs/current/indexes-opclass.html
	 *
	 * https://www.postgresql.org/docs/current/xindex.html
	 *
	 * ### Additional types
	 * If you have the `pg_vector` extension installed in your database, you can use the
	 * `vector_l2_ops`, `vector_ip_ops`, `vector_cosine_ops`, `vector_l1_ops`, `bit_hamming_ops`, `bit_jaccard_ops`, `halfvec_l2_ops`, `sparsevec_l2_ops` options, which are predefined types.
	 *
	 * **You can always specify any string you want in the operator class, in case Drizzle doesn't have it natively in its types**
	 *
	 * @param opClass
	 * @returns
	 */
	op(opClass: PgIndexOpClass): Omit<this, 'op'> {
		this.indexConfig.opClass = opClass;
		return this;
	}
}

export class IndexedColumn {
	static readonly [entityKind]: string = 'IndexedColumn';
	constructor(
		name: string | undefined,
		keyAsName: boolean,
		type: string,
		indexConfig: IndexedExtraConfigType,
	) {
		this.name = name;
		this.keyAsName = keyAsName;
		this.type = type;
		this.indexConfig = indexConfig;
	}

	name: string | undefined;
	keyAsName: boolean;
	type: string;
	indexConfig: IndexedExtraConfigType;
}

export type AnyPgColumn<
	TPartial extends Partial<PgColumnBaseConfig<ColumnType>> = {},
> = PgColumn<
	any,
	Required<Update<PgColumnBaseConfig<ColumnType>, TPartial>>
>;
