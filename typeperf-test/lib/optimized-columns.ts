/* eslint-disable drizzle-internal/require-entity-kind */
import {
	type ColumnBuilderBase,
	// type ColumnBuilderRuntimeConfig,
	type ColumnDataType,
	type DriverValueMapper,
	entityKind,
	type GeneratedColumnConfig,
	type GeneratedIdentityConfig,
	type MakeColumnConfig,
	type SQL,
	// sql,
	type SQLWrapper,
	// type Table,
} from 'drizzle-orm';
// import type { PgTable } from './optimized-tables.ts';

export interface ColumnBuilderBaseConfig<TDataType extends ColumnDataType, TColumnType extends string> {
	name: string;
	dataType: TDataType;
	columnType: TColumnType;
	data: unknown;
	driverParam: unknown;
	enumValues: string[] | undefined;
}

export interface ColumnBaseConfig<
	TDataType extends ColumnDataType = ColumnDataType,
	TColumnType extends string = string,
> extends ColumnBuilderBaseConfig<TDataType, TColumnType> {
	tableName: string;
	notNull: boolean;
	hasDefault: boolean;
	isPrimaryKey: boolean;
	isAutoincrement: boolean;
	hasRuntimeDefault: boolean;
}

// export interface ColumnBaseConfig<
// 	TDataType extends ColumnDataType = ColumnDataType,
// 	TColumnType extends string = string,
// > {
// 	name: string;
// 	dataType: TDataType;
// 	columnType: TColumnType;
// 	data: unknown;
// 	driverParam: unknown;
// 	enumValues: string[] | undefined;
// 	tableName: string;
// 	notNull: boolean;
// 	hasDefault: boolean;
// 	isPrimaryKey: boolean;
// 	isAutoincrement: boolean;
// 	hasRuntimeDefault: boolean;
// }

export interface ColumnTypeConfig<T extends ColumnBaseConfig> {
	dialect: 'pg';
	brand: 'Column';
	tableName: T['tableName'];
	name: T['name'];
	dataType: T['dataType'];
	columnType: T['columnType'];
	data: T['data'];
	driverParam: T['driverParam'];
	notNull: T['notNull'];
	hasDefault: T['hasDefault'];
	isPrimaryKey: T['isPrimaryKey'];
	isAutoincrement: T['isAutoincrement'];
	hasRuntimeDefault: T['hasRuntimeDefault'];
	enumValues: T['enumValues'];
	baseColumn: T extends {
		baseColumn: infer U;
	} ? U
		: unknown;
	generated: GeneratedColumnConfig<T['data']> | undefined;
	identity: undefined | 'always' | 'byDefault';
}

export interface ColumnBuilderRuntimeConfig<TData> {
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

export interface Column<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
> // eslint-disable-next-line @typescript-eslint/no-unused-vars
	extends
		// TTypeConfig extends object = object,
		DriverValueMapper<T['data'], T['driverParam']>,
		SQLWrapper
{}

export abstract class Column<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
> implements DriverValueMapper<T['data'], T['driverParam']>, SQLWrapper {
	static readonly [entityKind]: string = 'Column';

	declare readonly _: ColumnTypeConfig<T>;
	// declare readonly _: T;

	// readonly name: T['name'];
	// readonly keyAsName: boolean;
	// readonly primary: T['isPrimaryKey'];
	// readonly notNull: T['notNull'];
	// readonly default: T['data'] | SQL | undefined;
	// readonly defaultFn: (() => T['data'] | SQL) | undefined;
	// readonly onUpdateFn: (() => T['data'] | SQL) | undefined;
	// readonly hasDefault: T['hasDefault'];
	// declare readonly hasRuntimeDefault: T['hasRuntimeDefault'];
	// readonly isUnique: boolean;
	// readonly uniqueName: string | undefined;
	// readonly uniqueType: string | undefined;
	// readonly dataType: T['dataType'];
	// readonly columnType: T['columnType'];
	// readonly enumValues: T['enumValues'];
	// readonly generated: GeneratedColumnConfig<T['data']> | undefined = undefined;
	// readonly generatedIdentity: GeneratedIdentityConfig | undefined = undefined;

	readonly name: string;
	readonly keyAsName: boolean;
	readonly primary: boolean;
	readonly notNull: boolean;
	readonly default: T['data'] | SQL | undefined;
	readonly defaultFn: (() => T['data'] | SQL) | undefined;
	readonly onUpdateFn: (() => T['data'] | SQL) | undefined;
	readonly hasDefault: boolean;
	readonly isUnique: boolean;
	readonly uniqueName: string | undefined;
	readonly uniqueType: string | undefined;
	readonly dataType: T['dataType'];
	readonly columnType: T['columnType'];
	readonly enumValues: T['enumValues'] = undefined;
	readonly generated: GeneratedColumnConfig<T['data']> | undefined = undefined;
	readonly generatedIdentity: GeneratedIdentityConfig | undefined = undefined;

	protected config: ColumnBuilderRuntimeConfig<T['data']>;

	constructor(
		// table: Table,
		config: ColumnBuilderRuntimeConfig<T['data']>,
	) {
		this.config = config;
		this.name = config.name;
		this.keyAsName = config.keyAsName;
		this.notNull = config.notNull;
		this.default = config.default;
		this.defaultFn = config.defaultFn;
		this.onUpdateFn = config.onUpdateFn;
		this.hasDefault = config.hasDefault;
		this.primary = config.primaryKey;
		this.isUnique = config.isUnique;
		this.uniqueName = config.uniqueName;
		this.uniqueType = config.uniqueType;
		this.dataType = config.dataType as T['dataType'];
		this.columnType = config.columnType;
		this.generated = config.generated;
		this.generatedIdentity = config.generatedIdentity;
		this.enumValues = ('enumValues' in config ? config.enumValues : undefined) as T['enumValues'];
	}

	abstract getSQLType(): string;

	// getSQL(): SQL {
	// 	return sql`${sql.identifier(this._.tableName)}.${sql.identifier(this._.name)}`;
	// }

	mapFromDriverValue(value: unknown): unknown {
		return value;
	}

	mapToDriverValue(value: unknown): unknown {
		return value;
	}

	/** @internal */
	shouldDisableInsert(): boolean {
		// return this.config.generated !== undefined && this.config.generated.type !== 'byDefault';
		return true;
	}
}

export abstract class PgColumn<
	T extends ColumnBaseConfig<ColumnDataType, string> = ColumnBaseConfig<ColumnDataType, string>,
> extends Column<T> {
	static override readonly [entityKind]: string = 'PgColumn';

	constructor(
		// /*readonly*/ table: PgTable,
		config: ColumnBuilderRuntimeConfig<T['data']>,
	) {
		super(/*table,*/ config);
	}
}

export type BuildColumn<TTableName extends string, TBuilder extends ColumnBuilderBase> = PgColumn<
	MakeColumnConfig<TBuilder['_'], TTableName>
> // TBuilder['_']
;
export type BuildColumns<
	TTableName extends string,
	TConfigMap extends Record<string, ColumnBuilderBase>,
> // TDialect extends Dialect,
 =
	& {
		[Key in keyof TConfigMap]: BuildColumn<
			TTableName,
			TConfigMap[Key]
		>;
	}
	& {};

export type Update<T, TUpdate> =
	& {
		[K in Exclude<keyof T, keyof TUpdate>]: T[K];
	}
	& TUpdate;

export type AnyColumn<TPartial extends Partial<ColumnBaseConfig<ColumnDataType, string>> = {}> = Column<
	Required<Update<ColumnBaseConfig<ColumnDataType, string>, TPartial>>
>;
