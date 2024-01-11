import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	ColumnDataType,
	HasDefault,
	MakeColumnConfig,
	NotNull,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import type { OnConflict } from '~/sqlite-core/utils.ts';
import type { Equal, Or } from '~/utils.ts';
import type { AnySQLiteTable } from '../table.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export interface PrimaryKeyConfig {
	autoIncrement?: boolean;
	onConflict?: OnConflict;
}

export abstract class SQLiteBaseIntegerBuilder<
	T extends ColumnBuilderBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends SQLiteColumnBuilder<
	T,
	TRuntimeConfig & { autoIncrement: boolean },
	{},
	{ primaryKeyHasDefault: true }
> {
	static readonly [entityKind]: string = 'SQLiteBaseIntegerBuilder';

	constructor(name: T['name'], dataType: T['dataType'], columnType: T['columnType']) {
		super(name, dataType, columnType);
		this.config.autoIncrement = false;
	}

	override primaryKey(config?: PrimaryKeyConfig): HasDefault<NotNull<this>> {
		if (config?.autoIncrement) {
			this.config.autoIncrement = true;
		}
		this.config.hasDefault = true;
		return super.primaryKey() as HasDefault<NotNull<this>>;
	}

	/** @internal */
	abstract override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBaseInteger<MakeColumnConfig<T, TTableName>>;
}

export abstract class SQLiteBaseInteger<
	T extends ColumnBaseConfig<ColumnDataType, string>,
	TRuntimeConfig extends object = object,
> extends SQLiteColumn<T, TRuntimeConfig & { autoIncrement: boolean }> {
	static readonly [entityKind]: string = 'SQLiteBaseInteger';

	readonly autoIncrement: boolean = this.config.autoIncrement;

	getSQLType(): string {
		return 'integer';
	}
}

export type SQLiteIntegerBuilderInitial<TName extends string> = SQLiteIntegerBuilder<
	{
		name: TName;
		dataType: 'number';
		columnType: 'SQLiteInteger';
		data: number;
		driverParam: number;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class SQLiteIntegerBuilder<T extends ColumnBuilderBaseConfig<'number', 'SQLiteInteger'>>
	extends SQLiteBaseIntegerBuilder<T>
{
	static readonly [entityKind]: string = 'SQLiteIntegerBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'SQLiteInteger');
	}

	build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteInteger<MakeColumnConfig<T, TTableName>> {
		return new SQLiteInteger<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SQLiteInteger<T extends ColumnBaseConfig<'number', 'SQLiteInteger'>> extends SQLiteBaseInteger<T> {
	static readonly [entityKind]: string = 'SQLiteInteger';
}

export type SQLiteTimestampBuilderInitial<TName extends string> = SQLiteTimestampBuilder<
	{
		name: TName;
		dataType: 'date';
		columnType: 'SQLiteTimestamp';
		data: Date;
		driverParam: number;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class SQLiteTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'SQLiteTimestamp'>>
	extends SQLiteBaseIntegerBuilder<T, { mode: 'timestamp' | 'timestamp_ms' }>
{
	static readonly [entityKind]: string = 'SQLiteTimestampBuilder';

	constructor(name: T['name'], mode: 'timestamp' | 'timestamp_ms') {
		super(name, 'date', 'SQLiteTimestamp');
		this.config.mode = mode;
	}

	/**
	 * @deprecated Use `default()` with your own expression instead.
	 *
	 * Adds `DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))` to the column, which is the current epoch timestamp in milliseconds.
	 */
	defaultNow(): HasDefault<this> {
		return this.default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`) as any;
	}

	build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteTimestamp<MakeColumnConfig<T, TTableName>> {
		return new SQLiteTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SQLiteTimestamp<T extends ColumnBaseConfig<'date', 'SQLiteTimestamp'>>
	extends SQLiteBaseInteger<T, { mode: 'timestamp' | 'timestamp_ms' }>
{
	static readonly [entityKind]: string = 'SQLiteTimestamp';

	readonly mode: 'timestamp' | 'timestamp_ms' = this.config.mode;

	override mapFromDriverValue(value: number): Date {
		if (this.config.mode === 'timestamp') {
			return new Date(value * 1000);
		}
		return new Date(value);
	}

	override mapToDriverValue(value: Date): number {
		const unix = value.getTime();
		if (this.config.mode === 'timestamp') {
			return Math.floor(unix / 1000);
		}
		return unix;
	}
}

export type SQLiteBooleanBuilderInitial<TName extends string> = SQLiteBooleanBuilder<
	{
		name: TName;
		dataType: 'boolean';
		columnType: 'SQLiteBoolean';
		data: boolean;
		driverParam: number;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class SQLiteBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'SQLiteBoolean'>>
	extends SQLiteBaseIntegerBuilder<T, { mode: 'boolean' }>
{
	static readonly [entityKind]: string = 'SQLiteBooleanBuilder';

	constructor(name: T['name'], mode: 'boolean') {
		super(name, 'boolean', 'SQLiteBoolean');
		this.config.mode = mode;
	}

	build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBoolean<MakeColumnConfig<T, TTableName>> {
		return new SQLiteBoolean<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SQLiteBoolean<T extends ColumnBaseConfig<'boolean', 'SQLiteBoolean'>>
	extends SQLiteBaseInteger<T, { mode: 'boolean' }>
{
	static readonly [entityKind]: string = 'SQLiteBoolean';

	readonly mode: 'boolean' = this.config.mode;

	override mapFromDriverValue(value: number): boolean {
		return Number(value) === 1;
	}

	override mapToDriverValue(value: boolean): number {
		return value ? 1 : 0;
	}
}

export interface IntegerConfig<
	TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' =
		| 'number'
		| 'timestamp'
		| 'timestamp_ms'
		| 'boolean',
> {
	mode: TMode;
}

export function integer<TName extends string, TMode extends IntegerConfig['mode']>(
	name: TName,
	config?: IntegerConfig<TMode>,
): Or<Equal<TMode, 'timestamp'>, Equal<TMode, 'timestamp_ms'>> extends true ? SQLiteTimestampBuilderInitial<TName>
	: Equal<TMode, 'boolean'> extends true ? SQLiteBooleanBuilderInitial<TName>
	: SQLiteIntegerBuilderInitial<TName>;
export function integer(name: string, config?: IntegerConfig) {
	if (config?.mode === 'timestamp' || config?.mode === 'timestamp_ms') {
		return new SQLiteTimestampBuilder(name, config.mode);
	}
	if (config?.mode === 'boolean') {
		return new SQLiteBooleanBuilder(name, config.mode);
	}
	return new SQLiteIntegerBuilder(name);
}

export const int = integer;
