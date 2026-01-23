import type { ColumnType, GeneratedColumnConfig, GeneratedIdentityConfig } from '~/column-builder.ts';
import { Column } from '~/column.ts';
import type { AnyDSQLTable, DSQLTable } from '~/dsql-core/table.ts';
import { entityKind } from '~/entity.ts';
import type { SQL } from '~/sql/sql.ts';
import type { Update } from '~/utils.ts';

declare const DSQLColumnBuilderBrand: unique symbol;
export type DSQLColumnBuilderBrand = typeof DSQLColumnBuilderBrand;

declare const DSQLColumnBrand: unique symbol;
export type DSQLColumnBrand = typeof DSQLColumnBrand;

export interface DSQLColumnBuilderConfig {
	dataType: ColumnType;
	data: unknown;
	driverParam: unknown;
	notNull?: boolean;
	hasDefault?: boolean;
	isPrimaryKey?: boolean;
	isAutoincrement?: boolean;
	hasRuntimeDefault?: boolean;
	enumValues?: string[];
	generated?: unknown;
	$type?: unknown;
}

export interface DSQLColumnBuilderRuntimeConfig<TData> {
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
}

export interface DSQLColumnBaseConfig<out TDataType extends ColumnType = ColumnType> {
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

export type SetNotNull<T> = T & { readonly [DSQLColumnBuilderBrand]: { notNull: true } };
export type SetHasDefault<T> = T & { readonly [DSQLColumnBuilderBrand]: { hasDefault: true } };
export type SetIsPrimaryKey<T> = T & { readonly [DSQLColumnBuilderBrand]: { isPrimaryKey: true; notNull: true } };
export type SetHasRuntimeDefault<T> = T & {
	readonly [DSQLColumnBuilderBrand]: { hasRuntimeDefault: true; hasDefault: true };
};
export type Set$Type<T, TType> = T & { readonly [DSQLColumnBuilderBrand]: { $type: TType } };
export type SetHasGenerated<T> = T & {
	readonly [DSQLColumnBuilderBrand]: { hasDefault: true; generated: true };
};

type GetBaseData<T> = T extends { $type: infer U } ? U : T extends { data: infer D } ? D : unknown;

export type ResolveDSQLColumnConfig<
	out T extends DSQLColumnBuilderConfig,
	out TTableName extends string,
	out TData extends unknown = GetBaseData<T>,
> = {
	name: string;
	tableName: TTableName;
	dataType: T['dataType'];
	data: TData;
	driverParam: T['driverParam'];
	notNull: T['notNull'] extends true ? true : false;
	hasDefault: T['hasDefault'] extends true ? true : false;
	isPrimaryKey: false;
	isAutoincrement: false;
	hasRuntimeDefault: false;
	enumValues: T extends { enumValues: infer E extends string[] } ? E : undefined;
	generated: T['generated'] extends true ? true : undefined;
	identity: undefined;
} & {};

export interface AnyDSQLColumnBuilder {
	readonly [DSQLColumnBuilderBrand]: DSQLColumnBuilderConfig;
}

export interface AnyDSQLColumnInterface {
	readonly [DSQLColumnBrand]: DSQLColumnBaseConfig;
}

export type DSQLBuildColumn<
	TTableName extends string,
	TBuilder extends AnyDSQLColumnBuilder,
	TBuiltConfig extends DSQLColumnBaseConfig<ColumnType> = ResolveDSQLColumnConfig<
		TBuilder[DSQLColumnBuilderBrand],
		TTableName
	>,
> = DSQLColumn<ColumnType, TBuiltConfig, {}>;

export type DSQLBuildColumns<
	out TTableName extends string,
	out TConfigMap extends Record<string, AnyDSQLColumnBuilder>,
> =
	& {
		[Key in keyof TConfigMap]: DSQLBuildColumn<TTableName, TConfigMap[Key]>;
	}
	& {};

export type DSQLBuildExtraConfigColumns<
	out TConfigMap extends Record<string, AnyDSQLColumnBuilder>,
> =
	& {
		[Key in keyof TConfigMap]: ExtraConfigColumn;
	}
	& {};

export type DSQLColumns = Record<string, DSQLColumn>;

export abstract class DSQLColumnBuilder<
	out T extends DSQLColumnBuilderConfig = DSQLColumnBuilderConfig,
	out TRuntimeConfig extends object = object,
> {
	static readonly [entityKind]: string = 'DSQLColumnBuilder';

	declare readonly [DSQLColumnBuilderBrand]: T;

	protected config: DSQLColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;

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
			generatedIdentity: undefined,
			defaultFn: undefined,
			onUpdateFn: undefined,
		} as DSQLColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;
	}

	/**
	 * Changes the data type of the column. Commonly used with `json` columns. Also, useful for branded types.
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
	default(value: T['data'] | SQL): SetHasDefault<this> {
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
	$defaultFn(fn: () => T['data'] | SQL): SetHasRuntimeDefault<this> {
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
	$onUpdateFn(fn: () => T['data'] | SQL): SetHasDefault<this> {
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
	 */
	primaryKey(): SetIsPrimaryKey<this> {
		this.config.primaryKey = true;
		this.config.notNull = true;
		return this as SetIsPrimaryKey<this>;
	}

	/** @internal Sets the name of the column to the key within the table definition if a name was not given. */
	setName(name: string): void {
		if (this.config.name !== '') return;
		this.config.name = name;
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

	generatedAlwaysAs(as: SQL | (() => SQL)): SetHasGenerated<this> {
		this.config.generated = {
			as,
			type: 'always',
			mode: 'stored',
		};
		return this as SetHasGenerated<this>;
	}

	/** @internal */
	abstract build(table: DSQLTable): DSQLColumn<any>;

	/** @internal */
	buildExtraConfigColumn<TTableName extends string>(
		table: AnyDSQLTable<{ name: TTableName }>,
	): ExtraConfigColumn {
		return new ExtraConfigColumn(table as DSQLTable, this.config as any);
	}
}

export abstract class DSQLColumn<
	out TColumnType extends ColumnType = any,
	out T extends DSQLColumnBaseConfig<TColumnType> = DSQLColumnBaseConfig<TColumnType>,
	out TRuntimeConfig extends object = {},
> extends Column<T, TRuntimeConfig> {
	static override readonly [entityKind]: string = 'DSQLColumn';

	/** @internal */
	override readonly table: DSQLTable;

	constructor(
		table: DSQLTable,
		config: DSQLColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig,
	) {
		super(table, config);
		this.table = table;
	}
}

export type IndexedExtraConfigType = { order?: 'asc' | 'desc'; nulls?: 'first' | 'last'; opClass?: string };

export class ExtraConfigColumn<
	out T extends DSQLColumnBaseConfig<ColumnType> = DSQLColumnBaseConfig<ColumnType>,
> extends DSQLColumn<ColumnType, T, IndexedExtraConfigType> {
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

	op(opClass: string): Omit<this, 'op'> {
		this.indexConfig.opClass = opClass;
		return this;
	}
}

export class IndexedColumn {
	static readonly [entityKind]: string = 'IndexedColumn';

	name: string | undefined;
	keyAsName: boolean;
	type: string;
	indexConfig: IndexedExtraConfigType;

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
}

export type AnyDSQLColumn<
	TPartial extends Partial<DSQLColumnBaseConfig<ColumnType>> = {},
> = DSQLColumn<
	any,
	Required<Update<DSQLColumnBaseConfig<ColumnType>, TPartial>>
>;
