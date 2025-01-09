import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type ConvertCustomConfig<TName extends string, T extends Partial<CustomTypeValues>> =
	& {
		name: TName;
		dataType: 'custom';
		columnType: 'SingleStoreCustomColumn';
		data: T['data'];
		driverParam: T['driverData'];
		enumValues: undefined;
		generated: undefined;
	}
	& (T['notNull'] extends true ? { notNull: true } : {})
	& (T['default'] extends true ? { hasDefault: true } : {});

export interface SingleStoreCustomColumnInnerConfig {
	customTypeValues: CustomTypeValues;
}

export class SingleStoreCustomColumnBuilder<T extends ColumnBuilderBaseConfig<'custom', 'SingleStoreCustomColumn'>>
	extends SingleStoreColumnBuilder<
		T,
		{
			fieldConfig: CustomTypeValues['config'];
			customTypeParams: CustomTypeParams<any>;
		},
		{
			singlestoreColumnBuilderBrand: 'SingleStoreCustomColumnBuilderBrand';
		}
	>
{
	static override readonly [entityKind]: string = 'SingleStoreCustomColumnBuilder';

	constructor(
		name: T['name'],
		fieldConfig: CustomTypeValues['config'],
		customTypeParams: CustomTypeParams<any>,
	) {
		super(name, 'custom', 'SingleStoreCustomColumn');
		this.config.fieldConfig = fieldConfig;
		this.config.customTypeParams = customTypeParams;
	}

	/** @internal */
	build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreCustomColumn<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreCustomColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreCustomColumn<T extends ColumnBaseConfig<'custom', 'SingleStoreCustomColumn'>>
	extends SingleStoreColumn<T>
{
	static override readonly [entityKind]: string = 'SingleStoreCustomColumn';

	private sqlName: string;
	private mapTo?: (value: T['data']) => T['driverParam'];
	private mapFrom?: (value: T['driverParam']) => T['data'];

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreCustomColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.sqlName = config.customTypeParams.dataType(config.fieldConfig);
		this.mapTo = config.customTypeParams.toDriver;
		this.mapFrom = config.customTypeParams.fromDriver;
	}

	getSQLType(): string {
		return this.sqlName;
	}

	override mapFromDriverValue(value: T['driverParam']): T['data'] {
		return typeof this.mapFrom === 'function' ? this.mapFrom(value) : value as T['data'];
	}

	override mapToDriverValue(value: T['data']): T['driverParam'] {
		return typeof this.mapTo === 'function' ? this.mapTo(value) : value as T['data'];
	}
}

export type CustomTypeValues = {
	/**
	 * Required type for custom column, that will infer proper type model
	 *
	 * Examples:
	 *
	 * If you want your column to be `string` type after selecting/or on inserting - use `data: string`. Like `text`, `varchar`
	 *
	 * If you want your column to be `number` type after selecting/or on inserting - use `data: number`. Like `integer`
	 */
	data: unknown;

	/**
	 * Type helper, that represents what type database driver is accepting for specific database data type
	 */
	driverData?: unknown;

	/**
	 * What config type should be used for {@link CustomTypeParams} `dataType` generation
	 */
	config?: Record<string, any>;

	/**
	 * Whether the config argument should be required or not
	 * @default false
	 */
	configRequired?: boolean;

	/**
	 * If your custom data type should be notNull by default you can use `notNull: true`
	 *
	 * @example
	 * const customSerial = customType<{ data: number, notNull: true, default: true }>({
	 * 	  dataType() {
	 * 	    return 'serial';
	 *    },
	 * });
	 */
	notNull?: boolean;

	/**
	 * If your custom data type has default you can use `default: true`
	 *
	 * @example
	 * const customSerial = customType<{ data: number, notNull: true, default: true }>({
	 * 	  dataType() {
	 * 	    return 'serial';
	 *    },
	 * });
	 */
	default?: boolean;
};

export interface CustomTypeParams<T extends CustomTypeValues> {
	/**
	 * Database data type string representation, that is used for migrations
	 * @example
	 * ```
	 * `jsonb`, `text`
	 * ```
	 *
	 * If database data type needs additional params you can use them from `config` param
	 * @example
	 * ```
	 * `varchar(256)`, `numeric(2,3)`
	 * ```
	 *
	 * To make `config` be of specific type please use config generic in {@link CustomTypeValues}
	 *
	 * @example
	 * Usage example
	 * ```
	 *   dataType() {
	 *     return 'boolean';
	 *   },
	 * ```
	 * Or
	 * ```
	 *   dataType(config) {
	 * 	   return typeof config.length !== 'undefined' ? `varchar(${config.length})` : `varchar`;
	 * 	 }
	 * ```
	 */
	dataType: (config: T['config'] | (Equal<T['configRequired'], true> extends true ? never : undefined)) => string;

	/**
	 * Optional mapping function, between user input and driver
	 * @example
	 * For example, when using jsonb we need to map JS/TS object to string before writing to database
	 * ```
	 * toDriver(value: TData): string {
	 * 	 return JSON.stringify(value);
	 * }
	 * ```
	 */
	toDriver?: (value: T['data']) => T['driverData'] | SQL;

	/**
	 * Optional mapping function, that is responsible for data mapping from database to JS/TS code
	 * @example
	 * For example, when using timestamp we need to map string Date representation to JS Date
	 * ```
	 * fromDriver(value: string): Date {
	 * 	return new Date(value);
	 * },
	 * ```
	 */
	fromDriver?: (value: T['driverData']) => T['data'];
}

/**
 * Custom singlestore database data type generator
 */
export function customType<T extends CustomTypeValues = CustomTypeValues>(
	customTypeParams: CustomTypeParams<T>,
): Equal<T['configRequired'], true> extends true ? {
		<TConfig extends Record<string, any> & T['config']>(
			fieldConfig: TConfig,
		): SingleStoreCustomColumnBuilder<ConvertCustomConfig<'', T>>;
		<TName extends string>(
			dbName: TName,
			fieldConfig: T['config'],
		): SingleStoreCustomColumnBuilder<ConvertCustomConfig<TName, T>>;
	}
	: {
		(): SingleStoreCustomColumnBuilder<ConvertCustomConfig<'', T>>;
		<TConfig extends Record<string, any> & T['config']>(
			fieldConfig?: TConfig,
		): SingleStoreCustomColumnBuilder<ConvertCustomConfig<'', T>>;
		<TName extends string>(
			dbName: TName,
			fieldConfig?: T['config'],
		): SingleStoreCustomColumnBuilder<ConvertCustomConfig<TName, T>>;
	}
{
	return <TName extends string>(
		a?: TName | T['config'],
		b?: T['config'],
	): SingleStoreCustomColumnBuilder<ConvertCustomConfig<TName, T>> => {
		const { name, config } = getColumnNameAndConfig<T['config']>(a, b);
		return new SingleStoreCustomColumnBuilder(name as ConvertCustomConfig<TName, T>['name'], config, customTypeParams);
	};
}
