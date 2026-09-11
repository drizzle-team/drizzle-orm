import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import { entityKind } from '~/entity.ts';
import type { SQL, SQLGenerator } from '~/sql/sql.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { parseCockroachArray } from '../array.ts';
import { type CockroachColumnType, type CockroachType, resolveCockroachTypeAlias } from '../codecs.ts';
import {
	CockroachColumn,
	type CockroachColumnBaseConfig,
	CockroachColumnBuilder,
	type CockroachColumnBuilderRuntimeConfig,
} from './common.ts';

export type ConvertCustomConfig<T extends Partial<CustomTypeValues>> =
	& {
		dataType: 'custom';
		data: T['data'];
		driverParam: T['driverData'];
	}
	& (T['notNull'] extends true ? { notNull: true } : {})
	& (T['default'] extends true ? { hasDefault: true } : {});

export interface CockroachCustomColumnInnerConfig {
	customTypeValues: CustomTypeValues;
}

export class CockroachCustomColumnBuilder<T extends ColumnBuilderBaseConfig<'custom'>> extends CockroachColumnBuilder<
	T,
	{
		fieldConfig: CustomTypeValues['config'];
		customTypeParams: CustomTypeParams<any>;
	}
> {
	static override readonly [entityKind]: string = 'CockroachCustomColumnBuilder';

	constructor(
		name: string,
		fieldConfig: CustomTypeValues['config'],
		customTypeParams: CustomTypeParams<any>,
	) {
		super(name, 'custom', 'CockroachCustomColumn');
		this.config.fieldConfig = fieldConfig;
		this.config.customTypeParams = customTypeParams;
	}

	/** @internal */
	build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachCustomColumn(
			table,
			this.config,
		);
	}
}

export class CockroachCustomColumn<T extends CockroachColumnBaseConfig<'custom'>> extends CockroachColumn<'custom', T> {
	static override readonly [entityKind]: string = 'CockroachCustomColumn';

	/** @internal */
	override readonly codec?: CockroachType | undefined;

	private sqlName: string;
	readonly mapFromJsonValue?: (value: unknown) => T['data'];
	readonly jsonSelectIdentifier?: (identifier: SQL, sql: SQLGenerator, arrayDimensions?: number) => SQL;

	constructor(
		table: CockroachTable<any>,
		config: CockroachColumnBuilderRuntimeConfig<T['data']> & {
			fieldConfig: CustomTypeValues['config'];
			customTypeParams: CustomTypeParams<any>;
		},
	) {
		super(table, config);
		this.sqlName = config.customTypeParams.dataType(config.fieldConfig);
		this.mapToDriverValue = config.customTypeParams.toDriver ?? this.mapToDriverValue;
		this.mapFromDriverValue = config.customTypeParams.fromDriver ?? this.mapFromDriverValue;
		this.mapFromJsonValue = config.customTypeParams.fromJson;
		this.jsonSelectIdentifier = config.customTypeParams.forJsonSelect;
		const cfgCodec =
			typeof config.customTypeParams.codec === 'string' || typeof config.customTypeParams.codec === 'undefined'
				? config.customTypeParams.codec
				: config.customTypeParams.codec(config.fieldConfig);
		this.codec = typeof cfgCodec === 'string'
			? resolveCockroachTypeAlias(cfgCodec) as CockroachType // If it isn't `CockroachType`, codec search will simply resolve to no codec, which is supported behaviour
			: undefined;

		if (this.dimensions && config.customTypeParams.fromJson) {
			this.mapFromJsonValue = (value: unknown): unknown => {
				if (value === null) return value;
				const arr = typeof value === 'string' ? parseCockroachArray(value) : value as unknown[];
				return this.mapJsonArrayElements(arr, config.customTypeParams.fromJson!, this.dimensions);
			};
		}
	}

	/** @internal */
	private mapJsonArrayElements(value: unknown, mapper: (v: unknown) => unknown, depth: number): unknown {
		if (depth > 0 && Array.isArray(value)) {
			return value.map((v) => v === null ? null : this.mapJsonArrayElements(v, mapper, depth - 1));
		}
		return mapper(value);
	}

	getSQLType(): string {
		return this.sqlName;
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
	 * Bypasses JSON codecs if used
	 *
	 * Optional mapping function, that is used for transforming data returned by transofmed to JSON in database data to desired format
	 *
	 * Used by [relational queries](https://orm.drizzle.team/docs/rqb-v2)
	 *
	 * Defaults to {@link fromDriver} function
	 * @example
	 * For example, when querying bigint column via [RQB](https://orm.drizzle.team/docs/rqb-v2) or [JSON functions](https://orm.drizzle.team/docs/json-functions), the result field will be returned as it's string representation, as opposed to bigint from regular query
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
	 */
	fromJson?: (value: T['jsonData']) => T['data'];

	/**
	 * Bypasses JSON codecs if used
	 *
	 * Optional selection modifier function, that is used for modifying selection of column inside [JSON functions](https://orm.drizzle.team/docs/json-functions)
	 *
	 * Additional mapping that could be required for such scenarios can be handled using {@link fromJson} function
	 *
	 * Used by [relational queries](https://orm.drizzle.team/docs/rqb-v2)
	 *
	 * Following types are being casted to text by default: `geometry`, `timestamp`, `timestamptz`, `decimal`, `int8`
	 * @example
	 * For example, when using bigint we need to cast field to text to preserve data integrity
	 * ```
	 * forJsonSelect(identifier: SQL, sql: SQLGenerator, arrayDimensions?: number): SQL {
	 * 	return sql`${identifier}::text`
	 * },
	 * ```
	 *
	 * This will change query from:
	 * ```
	 * SELECT
	 * 	row_to_json("t".*)
	 * 	FROM
	 * 	(
	 * 		SELECT
	 * 		"table"."custom_bigint" AS "bigint"
	 * 		FROM
	 * 		"table"
	 * 	) AS "t"
	 * ```
	 * to:
	 * ```
	 * SELECT
	 * 	row_to_json("t".*)
	 * 	FROM
	 * 	(
	 * 		SELECT
	 * 		"table"."custom_bigint"::text AS "bigint"
	 * 		FROM
	 * 		"table"
	 * 	) AS "t"
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
	forJsonSelect?: (identifier: SQL, sql: SQLGenerator, arrayDimensions?: number) => SQL;

	/**
	 * Select which column type codec will be used for this column
	 */
	codec?:
		| CockroachColumnType
		| undefined
		| ((
			config: T['config'] | (Equal<T['configRequired'], true> extends true ? never : undefined),
		) => CockroachColumnType | undefined);
}

/**
 * Custom cockroach database data type generator
 */
export function customType<T extends CustomTypeValues = CustomTypeValues>(
	customTypeParams: CustomTypeParams<T>,
): Equal<T['configRequired'], true> extends true ? {
		<TConfig extends Record<string, any> & T['config']>(
			fieldConfig: TConfig,
		): CockroachCustomColumnBuilder<ConvertCustomConfig<T>>;
		(
			dbName: string,
			fieldConfig: T['config'],
		): CockroachCustomColumnBuilder<ConvertCustomConfig<T>>;
	}
	: {
		<TConfig extends Record<string, any> & T['config']>(
			fieldConfig?: TConfig,
		): CockroachCustomColumnBuilder<ConvertCustomConfig<T>>;
		(
			dbName: string,
			fieldConfig?: T['config'],
		): CockroachCustomColumnBuilder<ConvertCustomConfig<T>>;
	}
{
	return (
		a?: string | T['config'],
		b?: T['config'],
	): CockroachCustomColumnBuilder<ConvertCustomConfig<T>> => {
		const { name, config } = getColumnNameAndConfig<T['config']>(a, b);
		return new CockroachCustomColumnBuilder(name, config, customTypeParams);
	};
}
