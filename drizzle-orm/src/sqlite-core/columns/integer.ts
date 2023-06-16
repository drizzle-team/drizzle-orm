import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderHKTBase,
	ColumnBuilderKind,
	MakeColumnConfig,
	UpdateCBConfig,
} from '~/column-builder';
import { sql } from '~/sql';
import type { OnConflict } from '~/sqlite-core/utils';
import type { Assume, Equal, Or } from '~/utils';
import type { AnySQLiteTable } from '../table';
import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export interface PrimaryKeyConfig {
	autoIncrement?: boolean;
	onConflict?: OnConflict;
}

export abstract class SQLiteBaseIntegerBuilder<
	THKT extends ColumnBuilderHKTBase,
	T extends ColumnBuilderBaseConfig,
	TRuntimeConfig extends object = {},
> extends SQLiteColumnBuilder<THKT, T, TRuntimeConfig & { autoIncrement: boolean }> {
	constructor(name: T['name']) {
		super(name);
		this.config.autoIncrement = false;
	}

	override primaryKey(
		config?: PrimaryKeyConfig,
	): ColumnBuilderKind<THKT, UpdateCBConfig<T, { notNull: true; hasDefault: true }>> {
		if (config?.autoIncrement) {
			this.config.autoIncrement = true;
		}
		this.config.hasDefault = true;
		return super.primaryKey() as ReturnType<this['primaryKey']>;
	}

	/** @internal */
	abstract override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBaseInteger<Assume<THKT['_columnHKT'], ColumnHKTBase>, MakeColumnConfig<T, TTableName>>;
}

export abstract class SQLiteBaseInteger<
	THKT extends ColumnHKTBase,
	T extends ColumnBaseConfig,
	TRuntimeConfig extends object = {},
> extends SQLiteColumn<THKT, T, TRuntimeConfig & { autoIncrement: boolean }> {
	readonly autoIncrement: boolean = this.config.autoIncrement;

	getSQLType(): string {
		return 'integer';
	}
}

export interface SQLiteIntegerBuilderHKT extends ColumnBuilderHKTBase {
	_type: SQLiteIntegerBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: SQLiteIntegerHKT;
}

export interface SQLiteIntegerHKT extends ColumnHKTBase {
	_type: SQLiteInteger<Assume<this['config'], ColumnBaseConfig>>;
}

export type SQLiteIntegerBuilderInitial<TName extends string> = SQLiteIntegerBuilder<{
	name: TName;
	data: number;
	driverParam: number;
	notNull: false;
	hasDefault: false;
}>;

export class SQLiteIntegerBuilder<T extends ColumnBuilderBaseConfig>
	extends SQLiteBaseIntegerBuilder<SQLiteIntegerBuilderHKT, T>
{
	build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteInteger<MakeColumnConfig<T, TTableName>> {
		return new SQLiteInteger<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class SQLiteInteger<T extends ColumnBaseConfig> extends SQLiteBaseInteger<SQLiteIntegerHKT, T> {}

export interface SQLiteTimestampBuilderHKT extends ColumnBuilderHKTBase {
	_type: SQLiteTimestampBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: SQLiteTimestampHKT;
}

export interface SQLiteTimestampHKT extends ColumnHKTBase {
	_type: SQLiteTimestamp<Assume<this['config'], ColumnBaseConfig>>;
}

export type SQLiteTimestampBuilderInitial<TName extends string> = SQLiteTimestampBuilder<{
	name: TName;
	data: Date;
	driverParam: number;
	notNull: false;
	hasDefault: false;
}>;

export class SQLiteTimestampBuilder<T extends ColumnBuilderBaseConfig>
	extends SQLiteBaseIntegerBuilder<SQLiteTimestampBuilderHKT, T, { mode: 'timestamp' | 'timestamp_ms' }>
{
	constructor(name: T['name'], mode: 'timestamp' | 'timestamp_ms') {
		super(name);
		this.config.mode = mode;
	}

	/**
	 * @deprecated Use `default()` with your own expression instead.
	 *
	 * Adds `DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))` to the column, which is the current epoch timestamp in milliseconds.
	 */
	defaultNow(): ColumnBuilderKind<this['_']['hkt'], UpdateCBConfig<T, { hasDefault: true }>> {
		return this.default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`);
	}

	build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteTimestamp<MakeColumnConfig<T, TTableName>> {
		return new SQLiteTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config,
		);
	}
}

export class SQLiteTimestamp<T extends ColumnBaseConfig>
	extends SQLiteBaseInteger<SQLiteTimestampHKT, T, { mode: 'timestamp' | 'timestamp_ms' }>
{
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

export interface SQLiteBooleanBuilderHKT extends ColumnBuilderHKTBase {
	_type: SQLiteBooleanBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: SQLiteBooleanHKT;
}

export interface SQLiteBooleanHKT extends ColumnHKTBase {
	_type: SQLiteBoolean<Assume<this['config'], ColumnBaseConfig>>;
}

export type SQLiteBooleanBuilderInitial<TName extends string> = SQLiteBooleanBuilder<{
	name: TName;
	data: boolean;
	driverParam: number;
	notNull: false;
	hasDefault: false;
}>;

export class SQLiteBooleanBuilder<T extends ColumnBuilderBaseConfig>
	extends SQLiteBaseIntegerBuilder<SQLiteBooleanBuilderHKT, T, { mode: 'boolean' }>
{
	constructor(name: T['name'], mode: 'boolean') {
		super(name);
		this.config.mode = mode;
	}

	build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteBoolean<MakeColumnConfig<T, TTableName>> {
		return new SQLiteBoolean<MakeColumnConfig<T, TTableName>>(
			table,
			this.config,
		);
	}
}

export class SQLiteBoolean<T extends ColumnBaseConfig>
	extends SQLiteBaseInteger<SQLiteBooleanHKT, T, { mode: 'boolean' }>
{
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
