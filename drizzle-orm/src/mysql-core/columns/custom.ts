import { ColumnConfig } from '~/column';
import { ColumnBuilderConfig } from '~/column-builder';
import { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export type CustomColumnBuildeConfig<T extends CustomTypeValues> = {
	data: T['data'];
	driverParam: T['driverData'];
	notNull: T['notNull'] extends undefined ? false : T['notNull'] extends true ? true : false;
	hasDefault: T['default'] extends undefined ? false : T['default'] extends true ? true : false;
};

function returnColumn<
	TTableName extends string,
	TData,
	TNotNull extends boolean = false,
	TDefault extends boolean = false,
>(
	table: AnyMySqlTable<{ name: TTableName }>,
	config: MySqlColumnBuilder<
		ColumnConfig<{ data: TData; driverParam: string; notNull: TNotNull; hasDefault: TDefault }>
	>['config'],
	sqlName: string,
	mapTo?: (value: TData) => any,
	mapFrom?: (value: any) => TData,
): MySqlColumn<
	ColumnConfig<
		{
			tableName: TTableName;
			data: TData;
			driverParam: string;
			notNull: TNotNull;
			hasDefault: TDefault;
		}
	>
> {
	return new class extends MySqlColumn<
		ColumnConfig<
			{
				tableName: TTableName;
				data: TData;
				driverParam: string;
				notNull: TNotNull;
				hasDefault: TDefault;
			}
		>
	> {
		protected override $mySqlColumnBrand!: 'MysqlCustomColumnBrand';

		getSQLType(): string {
			return sqlName;
		}

		override mapFromDriverValue(value: any): TData {
			if (typeof mapFrom === 'function') {
				return mapFrom(value);
			} else {
				return value as TData;
			}
		}

		override mapToDriverValue(value: TData): any {
			if (typeof mapTo === 'function') {
				return mapTo(value);
			} else {
				return value as TData;
			}
		}
	}(table, config);
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
	config?: Record<string, unknown>;

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
	 * Database data type string represenation, that is used for migrations
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
	dataType: (config: T['config']) => string;

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
	toDriver?: (value: T['data']) => T['driverData'];

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
 * Custom mysql database data type generator
 */
export function customType<
	T extends CustomTypeValues,
>(
	customTypeParams: CustomTypeParams<T>,
): (
	dbName: string,
	fieldConfig?: T['config'],
) => MySqlColumnBuilder<
	ColumnBuilderConfig<CustomColumnBuildeConfig<T>>,
	Record<string, unknown>
> {
	return (dbName: string, fieldConfig?: T['config']) =>
		new class extends MySqlColumnBuilder<
			ColumnBuilderConfig<CustomColumnBuildeConfig<T>>,
			Record<string, unknown>
		> {
			protected $pgColumnBuilderBrand!: 'CustomColumnBuilderBrand';

			/** @internal */
			build<TTableName extends string>(
				table: AnyMySqlTable<{ name: TTableName }>,
			): MySqlColumn<
				ColumnConfig<CustomColumnBuildeConfig<T> & { tableName: TTableName }>
			> {
				return returnColumn(
					table,
					this.config,
					customTypeParams.dataType(fieldConfig),
					customTypeParams.toDriver,
					customTypeParams.fromDriver,
				);
			}
		}(dbName);
}
