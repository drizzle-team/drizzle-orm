import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQL, SQLGenerator } from '~/sql/sql.ts';
import type { AnySQLiteTable } from '~/sqlite-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export type ConvertCustomConfig<TName extends string, T extends Partial<CustomTypeValues>> =
	& {
		name: TName;
		dataType: 'custom';
		columnType: 'SQLiteCustomColumn';
		data: T['data'];
		driverParam: T['driverData'];
		enumValues: undefined;
	}
	& (T['notNull'] extends true ? { notNull: true } : {})
	& (T['default'] extends true ? { hasDefault: true } : {});

export interface SQLiteCustomColumnInnerConfig {
	customTypeValues: CustomTypeValues;
}

export class SQLiteCustomColumnBuilder<T extends ColumnBuilderBaseConfig<'custom', 'SQLiteCustomColumn'>>
	extends SQLiteColumnBuilder<
		T,
		{
			fieldConfig: CustomTypeValues['config'];
			customTypeParams: CustomTypeParams<any>;
		},
		{
			sqliteColumnBuilderBrand: 'SQLiteCustomColumnBuilderBrand';
		}
	>
{
	static override readonly [entityKind]: string = 'SQLiteCustomColumnBuilder';

	constructor(
		name: T['name'],
		fieldConfig: CustomTypeValues['config'],
		customTypeParams: CustomTypeParams<any>,
	) {
		super(name, 'custom', 'SQLiteCustomColumn');
		this.config.fieldConfig = fieldConfig;
		this.config.customTypeParams = customTypeParams;
	}

	/** @internal */
	build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteCustomColumn<MakeColumnConfig<T, TTableName>> {
		return new SQLiteCustomColumn<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SQLiteCustomColumn<T extends ColumnBaseConfig<'custom', 'SQLiteCustomColumn'>> extends SQLiteColumn<T> {
	static override readonly [entityKind]: string = 'SQLiteCustomColumn';

	private sqlName: string;
	private mapTo?: (value: T['data']) => T['driverParam'];
	private mapFrom?: (value: T['driverParam']) => T['data'];
	private mapJson?: (value: unknown) => T['data'];
	private forJsonSelect?: (name: SQL, sql: SQLGenerator) => SQL;

	constructor(
		table: AnySQLiteTable<{ name: T['tableName'] }>,
		config: SQLiteCustomColumnBuilder<T>['config'],
	) {
		super(table, config);
		this.sqlName = config.customTypeParams.dataType(config.fieldConfig);
		this.mapTo = config.customTypeParams.toDriver;
		this.mapFrom = config.customTypeParams.fromDriver;
		this.mapJson = config.customTypeParams.fromJson;
		this.forJsonSelect = config.customTypeParams.forJsonSelect;
	}

	getSQLType(): string {
		return this.sqlName;
	}

	override mapFromDriverValue(value: T['driverParam']): T['data'] {
		return typeof this.mapFrom === 'function' ? this.mapFrom(value) : value as T['data'];
	}

	mapFromJsonValue(value: unknown): T['data'] {
		return typeof this.mapJson === 'function' ? this.mapJson(value) : this.mapFromDriverValue(value) as T['data'];
	}

	jsonSelectIdentifier(identifier: SQL, sql: SQLGenerator): SQL {
		if (typeof this.forJsonSelect === 'function') return this.forJsonSelect(identifier, sql);

		const rawType = this.getSQLType().toLowerCase();
		const parenPos = rawType.indexOf('(');
		const type = (parenPos + 1) ? rawType.slice(0, parenPos) : rawType;

		switch (type) {
			case 'numeric':
			case 'decimal':
			case 'bigint': {
				return sql`cast(${identifier} as text)`;
			}
			case 'blob': {
				return sql`hex(${identifier})`;
			}
			default: {
				return identifier;
			}
		}
	}

	override mapToDriverValue(value: T['data']): T['driverParam'] {
		return typeof this.mapTo === 'function' ? this.mapTo(value) : value as T['data'];
	}
}

export interface CustomTypeValues {
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
	 * Type helper, that represents what type database driver is returning for specific database data type
	 *
	 * Needed only in case driver's output and input for type differ
	 *
	 * Defaults to {@link driverData}
	 */
	driverOutput?: unknown;

	/**
	 * Type helper, that represents what type field returns after being aggregated to JSON
	 */
	jsonData?: unknown;

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
}

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
	 * Optional mapping function, that is used to transform inputs from desired to be used in code format to one suitable for driver
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
	 * Optional mapping function, that is used for transforming data returned by driver to desired column's output format
	 * @example
	 * For example, when using timestamp we need to map string Date representation to JS Date
	 * ```
	 * fromDriver(value: string): Date {
	 * 	return new Date(value);
	 * }
	 * ```
	 *
	 * It'll cause the returned data to change from:
	 * ```
	 * {
	 * 	customField: "2025-04-07T03:25:16.635Z";
	 * }
	 * ```
	 * to:
	 * ```
	 * {
	 * 	customField: new Date("2025-04-07T03:25:16.635Z");
	 * }
	 * ```
	 */
	fromDriver?: (value: 'driverOutput' extends keyof T ? T['driverOutput'] : T['driverData']) => T['data'];

	/**
	 * Optional mapping function, that is used for transforming data returned by transofmed to JSON in database data to desired format
	 *
	 * Used by [relational queries](https://orm.drizzle.team/docs/rqb-v2)
	 *
	 * Defaults to {@link fromDriver} function
	 * @example
	 * For example, when querying blob column via [RQB](https://orm.drizzle.team/docs/rqb-v2) or [JSON functions](https://orm.drizzle.team/docs/json-functions), the result field will be returned as it's hex string representation, as opposed to Buffer from regular query
	 * To handle that, we need a separate function to handle such field's mapping:
	 * ```
	 * fromJson(value: string): Buffer {
	 * 	return Buffer.from(value, 'hex');
	 * },
	 * ```
	 *
	 * It'll cause the returned data to change from:
	 * ```
	 * {
	 * 	customField: "04A8...";
	 * }
	 * ```
	 * to:
	 * ```
	 * {
	 * 	customField: Buffer([...]);
	 * }
	 * ```
	 */
	fromJson?: (value: T['jsonData']) => T['data'];

	/**
	 * Optional selection modifier function, that is used for modifying selection of column inside [JSON functions](https://orm.drizzle.team/docs/json-functions)
	 *
	 * Additional mapping that could be required for such scenarios can be handled using {@link fromJson} function
	 *
	 * Used by [relational queries](https://orm.drizzle.team/docs/rqb-v2)
	 *
	 * Following types are being casted to text by default: `numeric`, `decimal`, `bigint`, `blob` (via `hex()` function)
	 * @example
	 * For example, when using numeric field for bigint storage we need to cast field to text to preserve data integrity
	 * ```
	 * forJsonSelect(identifier: SQL, sql: SQLGenerator): SQL {
	 * 	return sql`cast(${identifier} as text)`
	 * },
	 * ```
	 *
	 * This will change query from:
	 * ```
	 * SELECT
	 * 	json_object('bigint', `t`.`bigint`)
	 * 	FROM
	 * 	(
	 * 		SELECT
	 * 		`table`.`custom_bigint` AS "bigint"
	 * 		FROM
	 * 		`table`
	 * 	) AS `t`
	 * ```
	 * to:
	 * ```
	 * SELECT
	 * 	json_object('bigint', `t`.`bigint`)
	 * 	FROM
	 * 	(
	 * 		SELECT
	 * 		cast(`table`.`custom_bigint` as text) AS `bigint`
	 * 		FROM
	 * 		`table`
	 * 	) AS `t`
	 * ```
	 *
	 * Returned by query object will change from:
	 * ```
	 * {
	 * 	bigint: 5044565289845416000; // Partial data loss due to direct conversion to JSON format
	 * }
	 * ```
	 * to:
	 * ```
	 * {
	 * 	bigint: "5044565289845416380"; // Data is preserved due to conversion of field to text before JSON-ification
	 * }
	 * ```
	 */
	forJsonSelect?: (identifier: SQL, sql: SQLGenerator) => SQL;
}

/**
 * Custom sqlite database data type generator
 */
export function customType<T extends CustomTypeValues = CustomTypeValues>(
	customTypeParams: CustomTypeParams<T>,
): Equal<T['configRequired'], true> extends true ? {
		<TConfig extends Record<string, any> & T['config']>(
			fieldConfig: TConfig,
		): SQLiteCustomColumnBuilder<ConvertCustomConfig<'', T>>;
		<TName extends string>(
			dbName: TName,
			fieldConfig: T['config'],
		): SQLiteCustomColumnBuilder<ConvertCustomConfig<TName, T>>;
	}
	: {
		(): SQLiteCustomColumnBuilder<ConvertCustomConfig<'', T>>;
		<TConfig extends Record<string, any> & T['config']>(
			fieldConfig?: TConfig,
		): SQLiteCustomColumnBuilder<ConvertCustomConfig<'', T>>;
		<TName extends string>(
			dbName: TName,
			fieldConfig?: T['config'],
		): SQLiteCustomColumnBuilder<ConvertCustomConfig<TName, T>>;
	}
{
	return <TName extends string>(
		a?: TName | T['config'],
		b?: T['config'],
	): SQLiteCustomColumnBuilder<ConvertCustomConfig<TName, T>> => {
		const { name, config } = getColumnNameAndConfig<T['config']>(a, b);
		return new SQLiteCustomColumnBuilder(
			name as ConvertCustomConfig<TName, T>['name'],
			config,
			customTypeParams,
		);
	};
}
