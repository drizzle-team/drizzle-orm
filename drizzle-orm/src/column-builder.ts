import type { ColumnBaseConfig } from './column.ts';
import type { SQL } from './sql/sql.ts';
import type { Assume, IfNotAny } from './utils.ts';

export interface CustomTypeConfig<T extends CustomTypeAnyConfig> {
	dataType: () => string;
	toDriver: (value: T['data']) => T['driverData'];
	fromDriver: (value: T['driverData']) => T['data'];
	/**
	 * Optional function to transform the driver value to a selectable format.
	 * Useful for complex types like PostGIS geometries that need special SQL functions.
	 */
	selectFromDriver?: (value: T['driverData']) => SQL;
}

export interface CustomTypeAnyConfig {
	data: unknown;
	driverData: unknown;
}

export type CustomType<T extends CustomTypeAnyConfig> = ((
	config: CustomTypeConfig<T>,
) => ColumnBuilder<{
	name: string;
	dataType: 'custom';
	driverParam: T['driverData'];
	enumValues: undefined;
}>);

export interface ColumnBuilderBaseConfig<TName extends string, TDataType extends ColumnDataType> {
	name: TName;
	dataType: TDataType;
	columnType: string;
	data: unknown;
	driverParam: unknown;
	enumValues: TDataType extends 'enum' ? string[] : undefined;
}

export interface ColumnBuilderRuntimeConfig<T extends ColumnBuilderBaseConfig<any, any>, TGeneratedAlwaysConfig = any>
	extends ColumnBuilderBaseConfig<T['name'], T['dataType']>
{
	tableName: string;
	notNull: boolean;
	hasDefault: boolean;
	primaryKey: boolean;
	unique: boolean;
	generatedAlwaysConfig?: TGeneratedAlwaysConfig;
}

export type ColumnDataType =
	| 'array'
	| 'bigint'
	| 'boolean'
	| 'custom'
	| 'date'
	| 'enum'
	| 'json'
	| 'number'
	| 'string'
	| 'text'
	| 'time'
	| 'timestamp'
	| 'uuid';

export type MakeColumnConfig<T extends ColumnBuilderBaseConfig<string, ColumnDataType>, TTableName extends string> =
	& Omit<T, 'tableName'>
	& {
		tableName: TTableName;
		notNull: boolean;
		hasDefault: boolean;
		primaryKey: boolean;
		unique: boolean;
	};

export class ColumnBuilder<T extends ColumnBuilderBaseConfig<string, ColumnDataType>> {
	declare protected $brand: 'ColumnBuilder';

	protected config: ColumnBuilderRuntimeConfig<T>;

	constructor(name: T['name'], dataType: T['dataType'], columnType: T['columnType']) {
		this.config = {
			name,
			columnType,
			dataType,
			data: null,
			driverParam: null,
			enumValues: undefined,
			tableName: '',
			notNull: false,
			hasDefault: false,
			primaryKey: false,
			unique: false,
		} as ColumnBuilderRuntimeConfig<T>;
	}

	/** @internal */
	build<TTableName extends string>(table: AnyTable<{ name: TTableName }>): AnyColumn<{
		tableName: TTableName;
	}> {
		return null as AnyColumn<{ tableName: TTableName }>;
	}
}

export type AnyColumnBuilder = ColumnBuilder<ColumnBuilderBaseConfig<string, ColumnDataType>>;

export type ChangeColumnTableName<
	T extends AnyColumnBuilder,
	TAlias extends string,
	TDialect extends Dialect,
> = T extends ColumnBuilder<infer TConfig extends ColumnBuilderBaseConfig<string, ColumnDataType>>
	? ColumnBuilder<
		TDialect extends 'pg'
			? UpdateColumnBuilderConfig<TConfig, { tableName: TAlias; columnType: `Pg${TConfig['columnType']}` }>
			: TDialect extends 'mysql'
				? UpdateColumnBuilderConfig<TConfig, { tableName: TAlias; columnType: `MySql${TConfig['columnType']}` }>
				: TDialect extends 'sqlite'
					? UpdateColumnBuilderConfig<TConfig, { tableName: TAlias; columnType: `SQLite${TConfig['columnType']}` }>
					: TDialect extends 'mssql'
						? UpdateColumnBuilderConfig<TConfig, { tableName: TAlias; columnType: `MsSql${TConfig['columnType']}` }>
						: TDialect extends 'mysql2'
							? UpdateColumnBuilderConfig<TConfig, { tableName: TAlias; columnType: `MySql2${TConfig['columnType']` }>
							: TDialect extends 'better-sqlite'
								? UpdateColumnBuilderConfig<TConfig, { tableName: TAlias; columnType: `BetterSQLite${TConfig['columnType']}` }>
								: TDialect extends 'libsql'
									? UpdateColumnBuilderConfig<TConfig, { tableName: TAlias; columnType: `LibSQL${TConfig['columnType']}` }>
									: UpdateColumnBuilderConfig<TConfig, { tableName: TAlias }>
	>
	: never;

type UpdateColumnBuilderConfig<
	T extends ColumnBuilderBaseConfig<string, ColumnDataType>,
	K extends Partial<ColumnBuilderBaseConfig<string, ColumnDataType>>,
> = ColumnBuilderBaseConfig<string, ColumnDataType> & Omit<T, keyof K> & K;

export type Dialect =
	| 'pg'
	| 'mysql'
	| 'sqlite'
	| 'mssql'
	| 'mysql2'
	| 'better-sqlite'
	| 'libsql';

export type CustomTypeBuilder<T extends CustomTypeAnyConfig> = ColumnBuilder<{
	name: string;
	dataType: 'custom';
	driverParam: T['driverData'];
	enumValues: undefined;
}>;

export function customType<T extends CustomTypeAnyConfig>(config: CustomTypeConfig<T>): CustomTypeBuilder<T> {
	return new ColumnBuilder('', 'custom', 'CustomColumn') as CustomTypeBuilder<T>;
}