import type {
	ColumnBuilderRuntimeConfig,
	ColumnType,
	GeneratedColumnConfig,
	GeneratedIdentityConfig,
} from './column-builder.ts';
import { OriginalColumn } from './column-common.ts';
import { entityKind } from './entity.ts';
import type { DriverValueMapper, SQL, SQLWrapper } from './sql/sql.ts';
import type { Table } from './table.ts';
import type { Update } from './utils.ts';

export type Columns = Record<string, Column<any>>;

export interface ColumnBaseConfig<TDataType extends ColumnType> {
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

export interface Column<
	out T extends ColumnBaseConfig<ColumnType> = ColumnBaseConfig<ColumnType>,
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	out TRuntimeConfig extends object = object,
> extends DriverValueMapper<T['data'], T['driverParam']>, SQLWrapper {
	// SQLWrapper runtime implementation is defined in 'sql/sql.ts'
	// `as` runtime implementation is defined in 'alias.ts'
	as(alias: string): this;
}

/*
	`Column` only accepts a full `ColumnConfig` as its generic.
	To infer parts of the config, use `AnyColumn` that accepts a partial config.
	See `GetColumnData` for example usage of inferring.
*/
export abstract class Column<
	out T extends ColumnBaseConfig<ColumnType> = ColumnBaseConfig<ColumnType>,
	out TRuntimeConfig extends object = object,
> implements DriverValueMapper<T['data'], T['driverParam']>, SQLWrapper {
	static readonly [entityKind]: string = 'Column';

	declare readonly _: T;

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
	readonly columnType: string;
	readonly enumValues: T['enumValues'] = undefined;
	readonly generated: GeneratedColumnConfig<T['data']> | undefined = undefined;
	readonly generatedIdentity: GeneratedIdentityConfig | undefined = undefined;
	readonly length: number | undefined;
	readonly isLengthExact: boolean | undefined;
	readonly isAlias: boolean;

	/** @internal */
	protected config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig;

	/** @internal */
	readonly table: Table;

	/** @internal */
	protected onInit(): void {}

	constructor(
		table: Table,
		config: ColumnBuilderRuntimeConfig<T['data']> & TRuntimeConfig,
	) {
		this.config = config;
		this.onInit();
		this.table = table;

		this.name = config.name;
		this.isAlias = false;
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
		this.length = (<{ length?: number }> config)['length'];
		this.isLengthExact = (<{ isLengthExact?: boolean }> config)['isLengthExact'];
	}

	abstract getSQLType(): string;

	mapFromDriverValue(value: unknown): unknown {
		return value;
	}

	mapToDriverValue(value: unknown): unknown {
		return value;
	}

	// ** @internal */
	shouldDisableInsert(): boolean {
		return this.config.generated !== undefined && this.config.generated.type !== 'byDefault';
	}

	/** @internal */
	[OriginalColumn](): this {
		return this;
	}
}

export type UpdateColConfig<
	T extends ColumnBaseConfig<ColumnType>,
	TUpdate extends Partial<ColumnBaseConfig<ColumnType>>,
> = Update<T, TUpdate>;

export type AnyColumn<TPartial extends Partial<ColumnBaseConfig<ColumnType>> = {}> = Column<
	Required<Update<ColumnBaseConfig<ColumnType>, TPartial>>
>;

export type GetColumnData<TColumn extends Column, TInferMode extends 'query' | 'raw' = 'query'> =
	// dprint-ignore
	TInferMode extends 'raw' // Raw mode
		? TColumn['_']['data'] // Just return the underlying type
		: TColumn['_']['notNull'] extends true // Query mode
		? TColumn['_']['data'] // Query mode, not null
		: TColumn['_']['data'] | null; // Query mode, nullable

export type InferColumnsDataTypes<TColumns extends Record<string, Column>> = {
	[Key in keyof TColumns]: GetColumnData<TColumns[Key], 'query'>;
};

export function getColumnTable<TTable extends Table<any> = Table<any>>(column: Column<any>): TTable {
	return column.table as TTable;
}
