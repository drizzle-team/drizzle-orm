import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import type { SQL, SQLGenerator } from '~/sql/sql.ts';
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
	private mapJson?: (value: unknown) => T['data'];
	private forJsonSelect?: (name: SQL, sql: SQLGenerator) => SQL;

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreCustomColumnBuilder<T>['config'],
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
			case 'binary':
			case 'varbinary':
			case 'time':
			case 'datetime':
			case 'decimal':
			case 'float':
			case 'bigint': {
				return sql`cast(${identifier} as char)`;
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
	 * Type helper, that represents what type database driver is returning for specific database data type
	 *
	 * Needed only in case driver's output and input for type differ
	 *
	 * @default
	 * Defaults to `driverData`
	 */
	driverOutput?: unknown;

	/**
	 * Type helper, that represents what type database driver is accepting for specific database data type
	 */
	driverData?: unknown;

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
	 * 	customField: "2025-04-07 03:25:16.635";
	 * }
	 * ```
	 * to:
	 * ```
	 * {
	 * 	customField: new Date("2025-04-07 03:25:16.635");
	 * }
	 * ```
	 */
	fromDriver?: (value: 'driverOutput' extends keyof T ? T['driverOutput'] : T['driverData']) => T['data'];

	/**
	 * Optional mapping function, that is used for transforming data returned by transofmed to JSON in database data to desired format
	 *
	 * Used by relational queries
	 * @example
	 * For example, when querying bigint column via RQB or JSON funcitons, the result field will be returned as it's string representation, as opposed to bigint from regular query
	 * To handle that, we need a separate function to handle such field's mapping:
	 * ```
	 * fromJson(value: string): bigint {
	 * 	return BigInt(value);
	 * },
	 * ```
	 *
	 * It'll cause the returned data to change from:
	 * ```
	 * {
	 * 	customField: "5044565289845416380";
	 * }
	 * ```
	 * to:
	 * ```
	 * {
	 * 	customField: 5044565289845416380n;
	 * }
	 * ```
	 * @default
	 * Defaults to {@link fromDriver} function
	 */
	fromJson?: (value: T['jsonData']) => T['data'];

	/**
	 * Optional selection modifier function, that is used for modifying selection of column inside JSON functions
	 *
	 * Additional mapping that could be required for such scenarios can be handled using {@link fromJson} function
	 *
	 * Used by relational queries
	 * @example
	 * For example, when using bigint we need to cast field to text to preserve data integrity
	 * ```
	 * forJsonSelect(identifier: SQL, sql: SQLGenerator): SQL {
	 * 	return sql`cast(${identifier} as char)`
	 * },
	 * ```
	 *
	 * This will change query from:
	 * ```
	 * SELECT
	 * 	json_build_object('bigint', `t`.`bigint`)
	 * 	FROM
	 * 	(
	 * 		SELECT
	 * 		`table`.`custom_bigint` AS `bigint`
	 * 		FROM
	 * 		`table`
	 * 	) AS `t`
	 * ```
	 * to:
	 * ```
	 * SELECT
	 * 	json_build_object('bigint', `t`.`bigint`)
	 * 	FROM
	 * 	(
	 * 		SELECT
	 * 		cast(`table`.`custom_bigint` as char) AS `bigint`
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
	 *
	 * @default
	 * Following types are being casted to text by default: `binary`, `varbinary`, `time`, `datetime`, `decimal`, `float`, 'bigint'
	 */
	forJsonSelect?: (identifier: SQL, sql: SQLGenerator) => SQL;
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
