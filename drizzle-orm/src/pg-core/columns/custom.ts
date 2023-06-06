import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyPgTable } from '~/pg-core/table';
import type { SQL } from '~/sql';
import { type Assume, type Equal, type Simplify } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export type ConvertCustomConfig<TName extends string, T extends Partial<CustomTypeValues>> = Simplify<{
	name: TName;
	data: T['data'];
	driverParam: T['driverData'];
	// notNull and hasDefault will be of type "unknown" if not defined in T. Thank you TS
	notNull: T['notNull'] extends true ? true : false;
	hasDefault: T['default'] extends true ? true : false;
}>;

export interface PgCustomColumnInnerConfig {
	customTypeValues: CustomTypeValues;
}

export interface PgCustomColumnBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgCustomColumnBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgCustomColumnHKT;
}

export interface PgCustomColumnHKT extends ColumnHKTBase {
	_type: PgCustomColumn<Assume<this['config'], ColumnBaseConfig>>;
}

export class PgCustomColumnBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<
	PgCustomColumnBuilderHKT,
	T,
	{
		fieldConfig: CustomTypeValues['config'];
		customTypeParams: CustomTypeParams<any>;
	},
	{
		pgColumnBuilderBrand: 'PgCustomColumnBuilderBrand';
	}
> {
	static readonly [entityKind]: string = 'PgCustomColumnBuilder';

	constructor(
		name: T['name'],
		fieldConfig: CustomTypeValues['config'],
		customTypeParams: CustomTypeParams<any>,
	) {
		super(name);
		this.config.fieldConfig = fieldConfig;
		this.config.customTypeParams = customTypeParams;
	}

	/** @internal */
	build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgCustomColumn<MakeColumnConfig<T, TTableName>> {
		return new PgCustomColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config,
		);
	}
}

export class PgCustomColumn<T extends ColumnBaseConfig> extends PgColumn<PgCustomColumnHKT, T> {
	static readonly [entityKind]: string = 'PgCustomColumn';

	declare protected $pgColumnBrand: 'PgCustomColumn';

	private sqlName: string;
	private mapTo?: (value: T['data']) => T['driverParam'];
	private mapFrom?: (value: T['driverParam']) => T['data'];

	constructor(
		table: AnyPgTable<{ name: T['tableName'] }>,
		config: PgCustomColumnBuilder<T>['config'],
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
	config?: unknown;

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
 * Custom pg database data type generator
 */
export function customType<T extends CustomTypeValues = CustomTypeValues>(
	customTypeParams: CustomTypeParams<T>,
): Equal<T['configRequired'], true> extends true ? <TName extends string>(
		dbName: TName,
		fieldConfig: T['config'],
	) => PgCustomColumnBuilder<ConvertCustomConfig<TName, T>>
	: <TName extends string>(
		dbName: TName,
		fieldConfig?: T['config'],
	) => PgCustomColumnBuilder<ConvertCustomConfig<TName, T>>
{
	return <TName extends string>(
		dbName: TName,
		fieldConfig?: T['config'],
	): PgCustomColumnBuilder<ConvertCustomConfig<TName, T>> => {
		return new PgCustomColumnBuilder(dbName, fieldConfig, customTypeParams);
	};
}
