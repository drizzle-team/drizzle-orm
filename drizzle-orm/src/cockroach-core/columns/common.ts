import type { ForeignKey, UpdateDeleteAction } from '~/cockroach-core/foreign-keys.ts';
import { ForeignKeyBuilder } from '~/cockroach-core/foreign-keys.ts';
import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnType, GeneratedColumnConfig, GeneratedIdentityConfig } from '~/column-builder.ts';
import { Column } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import { iife } from '~/tracing-utils.ts';
import type { Update } from '~/utils.ts';
import type { CockroachType } from '../codecs.ts';

export type CockroachArrayDimension = 0 | 1 | 2 | 3 | 4 | 5;
type CockroachArrayDimensionString = '[]' | '[][]' | '[][][]' | '[][][][]' | '[][][][][]';

type ArrayDimensionStringToNumber<T extends CockroachArrayDimensionString> = T extends '[]' ? 1
	: T extends '[][]' ? 2
	: T extends '[][][]' ? 3
	: T extends '[][][][]' ? 4
	: T extends '[][][][][]' ? 5
	: never;

export interface CockroachColumnBuilderConfig {
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
	dimensions?: CockroachArrayDimension;
	$type?: unknown;
}

export interface CockroachColumnBuilderRuntimeConfig<TData> {
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
	dimensions?: CockroachArrayDimension;
}

// TODO: remove isAutoincrement and hasRuntimeDefault
export interface CockroachColumnBaseConfig<out TDataType extends ColumnType = ColumnType> {
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
}

type WrapArray<T, N extends number> = N extends 1 ? T[]
	: N extends 2 ? T[][]
	: N extends 3 ? T[][][]
	: N extends 4 ? T[][][][]
	: N extends 5 ? T[][][][][]
	: T;

export type SetNotNull<T> = T & { readonly _: { notNull: true } };
export type SetHasDefault<T> = T & { readonly _: { hasDefault: true } };
export type SetIsPrimaryKey<T> = T & { readonly _: { isPrimaryKey: true; notNull: true } };
export type SetHasRuntimeDefault<T> = T & {
	readonly _: { hasRuntimeDefault: true; hasDefault: true };
};
export type Set$Type<T, TType> = T & { readonly _: { $type: TType } };
export type SetHasGenerated<T> = T & {
	readonly _: { hasDefault: true; generated: true };
};
export type SetDimensions<T, TDim extends CockroachArrayDimension> = T & {
	readonly _: { dimensions: TDim };
};
export type SetIdentity<T, TType extends 'always' | 'byDefault'> = T & {
	readonly _: { notNull: true; hasDefault: true; identity: TType };
};

export type HasIdentity<T, TType extends 'always' | 'byDefault'> = SetIdentity<T, TType>;

type GetBaseData<T> = T extends { $type: infer U } ? U : T extends { data: infer D } ? D : unknown;

type ResolveData<T extends CockroachColumnBuilderConfig> = T['dimensions'] extends 1 | 2 | 3 | 4 | 5
	? WrapArray<GetBaseData<T>, T['dimensions']>
	: GetBaseData<T>;

export type ResolveCockroachColumnConfig<
	out T extends CockroachColumnBuilderConfig,
	out TTableName extends string,
	out TData = ResolveData<T>,
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
} & {};

export interface AnyCockroachColumnBuilder {
	readonly _: CockroachColumnBuilderConfig;
}

export type CockroachBuildColumn<
	TTableName extends string,
	TBuilder extends AnyCockroachColumnBuilder,
	TBuiltConfig extends CockroachColumnBaseConfig<ColumnType> = ResolveCockroachColumnConfig<
		TBuilder['_'],
		TTableName
	>,
> = CockroachColumn<ColumnType, TBuiltConfig, {}>;

export type CockroachBuildColumns<
	out TTableName extends string,
	out TConfigMap extends Record<string, AnyCockroachColumnBuilder>,
> =
	& {
		[Key in keyof TConfigMap]: CockroachBuildColumn<TTableName, TConfigMap[Key]>;
	}
	& {};

export type CockroachBuildExtraConfigColumns<
	out TConfigMap extends Record<string, AnyCockroachColumnBuilder>,
> =
	& {
		[Key in keyof TConfigMap]: ExtraConfigColumn;
	}
	& {};

export type CockroachColumns = Record<string, CockroachColumn<any>>;

export interface ReferenceConfig {
	ref: () => CockroachColumn;
	config: {
		name?: string;
		onUpdate?: UpdateDeleteAction;
		onDelete?: UpdateDeleteAction;
	};
}

export abstract class CockroachColumnBuilder<
	out T extends CockroachColumnBuilderConfig = CockroachColumnBuilderConfig,
	out TRuntimeConfig extends object = object,
> {
	static readonly [entityKind]: string = 'CockroachColumnBuilder';

	declare readonly _: T;

	private foreignKeyConfigs: ReferenceConfig[] = [];

	/** @internal */
	protected config: CockroachColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;

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
		} as CockroachColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;
	}

	/**
	 * Changes the data type of the column. Commonly used with `jsonb` columns. Also, useful for branded types.
	 *
	 * @example
	 * ```ts
	 * const users = cockroachTable('users', {
	 * 	id: int4('id').$type<UserId>().primaryKey(),
	 * 	details: jsonb('details').$type<UserDetails>().notNull(),
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
	default(value: ResolveData<this['_']> | SQL): SetHasDefault<this> {
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
	$defaultFn(fn: () => ResolveData<this['_']> | SQL): SetHasRuntimeDefault<this> {
		this.config.defaultFn = fn;
		this.config.hasDefault = true;
		return this as SetHasRuntimeDefault<this>;
	}

	/**
	 * Alias for {@link $defaultFn}.
	 */
	$default(fn: () => ResolveData<this['_']> | SQL): SetHasRuntimeDefault<this> {
		return this.$defaultFn(fn);
	}

	/**
	 * Adds a dynamic update value to the column.
	 * The function will be called when the row is updated, and the returned value will be used as the column value if none is provided.
	 * If no `default` (or `$defaultFn`) value is provided, the function will be called when the row is inserted as well, and the returned value will be used as the column value.
	 *
	 * **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
	 */
	$onUpdateFn(fn: () => ResolveData<this['_']> | SQL): SetHasDefault<this> {
		this.config.onUpdateFn = fn;
		this.config.hasDefault = true;
		return this as SetHasDefault<this>;
	}

	/**
	 * Alias for {@link $onUpdateFn}.
	 */
	$onUpdate(fn: () => ResolveData<this['_']> | SQL): SetHasDefault<this> {
		return this.$onUpdateFn(fn);
	}

	/**
	 * Adds a `primary key` clause to the column definition. This implicitly makes the column `not null`.
	 */
	primaryKey(): SetIsPrimaryKey<this> {
		this.config.primaryKey = true;
		this.config.notNull = true;
		return this as SetIsPrimaryKey<this>;
	}

	/** @internal Sets the name of the column to the key within the table definition if a name was not given. */
	setName(name: string, casingFn: (name: string) => string) {
		if (this.config.name !== '') return;
		this.config.name = casingFn(name);
	}

	/**
	 * Makes this column a CockroachDB array column.
	 *
	 * @example
	 * ```ts
	 * const t = cockroachTable('t', {
	 *   // 1D array: number[]
	 *   tags: int4().array(),
	 *   // Or explicitly: int4().array('[]')
	 *   // 2D array: number[][]
	 *   matrix: int4().array('[][]'),
	 * });
	 * ```
	 */
	array(): SetDimensions<this, 1>;
	array<TDim extends CockroachArrayDimensionString>(
		dimensions: TDim,
	): SetDimensions<this, ArrayDimensionStringToNumber<TDim>>;
	array<TDim extends CockroachArrayDimensionString>(
		dimensions?: TDim,
	): SetDimensions<this, ArrayDimensionStringToNumber<TDim>> {
		// Calculate dimensions as number from string notation
		const dim = dimensions ?? '[]';
		this.config.dimensions = (dim.length / 2) as CockroachArrayDimension;
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
	): this {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		return this;
	}

	generatedAlwaysAs(as: SQL | (() => SQL)): SetHasGenerated<this> {
		this.config.generated = {
			as,
			type: 'always',
			mode: 'stored',
		};
		return this as SetHasGenerated<this>;
	}

	/** @internal */
	buildForeignKeys(column: CockroachColumn, table: CockroachTable): ForeignKey[] {
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
	abstract build(table: CockroachTable): CockroachColumn<any>;

	/** @internal */
	buildExtraConfigColumn<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): ExtraConfigColumn {
		return new ExtraConfigColumn(table, { ...this.config, dimensions: this.config.dimensions ?? 0 });
	}
}

export abstract class CockroachColumn<
	out TColumnType extends ColumnType = any,
	out T extends CockroachColumnBaseConfig<TColumnType> = CockroachColumnBaseConfig<TColumnType>,
	out TRuntimeConfig extends object = {},
> extends Column<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'CockroachColumn';

	/** @internal */
	abstract override readonly codec?: CockroachType;

	/** @internal */
	override readonly table: CockroachTable;

	readonly dimensions: CockroachArrayDimension;

	constructor(
		table: CockroachTable,
		config: CockroachColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig,
	) {
		super(table, config);
		this.table = table;
		this.dimensions = config.dimensions ?? 0;
	}

	/** @internal */
	override postBuild() {
		if (this.dimensions) {
			const originalFromDriver = this.mapFromDriverValue.bind(this);
			const originalToDriver = this.mapToDriverValue.bind(this);

			this.mapFromDriverValue = this.mapFromDriverValue.isNoop
				? this.mapFromDriverValue
				: (value: unknown): unknown => {
					return this.mapArrayElements(value, originalFromDriver, this.dimensions);
				};

			this.mapToDriverValue = this.mapToDriverValue.isNoop
				? this.mapToDriverValue
				: (value: unknown): unknown => {
					return this.mapArrayElements(value as unknown[], originalToDriver, this.dimensions);
				};
		}

		return this;
	}

	/** @internal */
	override shouldDisableInsert(): boolean {
		return (this.config.generatedIdentity !== undefined && this.config.generatedIdentity.type !== 'byDefault')
			|| (this.config.generated !== undefined && this.config.generated.type !== 'byDefault');
	}

	/** @internal */
	private mapArrayElements(value: unknown, mapper: (v: unknown) => unknown, depth: number): unknown {
		if (depth > 0 && Array.isArray(value)) {
			return value.map((v) => v === null ? null : this.mapArrayElements(v, mapper, depth - 1));
		}
		return mapper(value);
	}
}

export type IndexedExtraConfigType = { order?: 'asc' | 'desc' };

export class ExtraConfigColumn<
	out T extends CockroachColumnBaseConfig<ColumnType> = CockroachColumnBaseConfig<ColumnType>,
> extends CockroachColumn<ColumnType, T, IndexedExtraConfigType> {
	static override readonly [entityKind]: string = 'ExtraConfigColumn';

	/** @internal */
	override readonly codec = undefined;

	override getSQLType(): string {
		return this.getSQLType();
	}

	indexConfig: IndexedExtraConfigType = {
		order: this.config.order ?? 'asc',
	};
	defaultConfig: IndexedExtraConfigType = {
		order: 'asc',
	};

	asc(): Omit<this, 'asc' | 'desc'> {
		this.indexConfig.order = 'asc';
		return this;
	}

	desc(): Omit<this, 'asc' | 'desc'> {
		this.indexConfig.order = 'desc';
		return this;
	}
}

export class IndexedColumn {
	static readonly [entityKind]: string = 'IndexedColumn';
	constructor(
		name: string,
		keyAsName: boolean,
		type: string,
		indexConfig: IndexedExtraConfigType,
	) {
		this.name = name;
		this.keyAsName = keyAsName;
		this.type = type;
		this.indexConfig = indexConfig;
	}

	name: string;
	keyAsName: boolean;
	type: string;
	indexConfig: IndexedExtraConfigType;
}

export type AnyCockroachColumn<
	TPartial extends Partial<CockroachColumnBaseConfig<ColumnType>> = {},
> = CockroachColumn<
	any,
	Required<Update<CockroachColumnBaseConfig<ColumnType>, TPartial>>
>;
