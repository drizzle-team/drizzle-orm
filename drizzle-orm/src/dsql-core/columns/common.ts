import type { ColumnType, GeneratedColumnConfig } from '~/column-builder.ts';
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
			defaultFn: undefined,
			onUpdateFn: undefined,
		} as DSQLColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;
	}

	$type<TType>(): Set$Type<this, TType> {
		throw new Error('Method not implemented.');
	}

	notNull(): SetNotNull<this> {
		throw new Error('Method not implemented.');
	}

	default(value: T['data'] | SQL): SetHasDefault<this> {
		throw new Error('Method not implemented.');
	}

	$defaultFn(fn: () => T['data'] | SQL): SetHasRuntimeDefault<this> {
		throw new Error('Method not implemented.');
	}

	$default = this.$defaultFn;

	$onUpdateFn(fn: () => T['data'] | SQL): SetHasDefault<this> {
		throw new Error('Method not implemented.');
	}

	$onUpdate = this.$onUpdateFn;

	primaryKey(): SetIsPrimaryKey<this> {
		throw new Error('Method not implemented.');
	}

	setName(name: string): void {
		throw new Error('Method not implemented.');
	}

	unique(
		name?: string,
		config?: { nulls: 'distinct' | 'not distinct' },
	): this {
		throw new Error('Method not implemented.');
	}

	generatedAlwaysAs(as: SQL | (() => SQL)): SetHasGenerated<this> {
		throw new Error('Method not implemented.');
	}

	/** @internal */
	abstract build(table: DSQLTable): DSQLColumn<any>;

	/** @internal */
	buildExtraConfigColumn<TTableName extends string>(
		table: AnyDSQLTable<{ name: TTableName }>,
	): ExtraConfigColumn {
		throw new Error('Method not implemented.');
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
		throw new Error('Method not implemented.');
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
		throw new Error('Method not implemented.');
	}

	desc(): Omit<this, 'asc' | 'desc'> {
		throw new Error('Method not implemented.');
	}

	nullsFirst(): Omit<this, 'nullsFirst' | 'nullsLast'> {
		throw new Error('Method not implemented.');
	}

	nullsLast(): Omit<this, 'nullsFirst' | 'nullsLast'> {
		throw new Error('Method not implemented.');
	}

	op(opClass: string): Omit<this, 'op'> {
		throw new Error('Method not implemented.');
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
