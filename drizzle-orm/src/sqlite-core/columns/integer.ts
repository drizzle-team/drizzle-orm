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
import type { Assume } from '~/utils';
import type { AnySQLiteTable } from '../table';
import { SQLiteColumn, SQLiteColumnBuilder } from './common';

export interface PrimaryKeyConfig {
	autoIncrement?: boolean;
	onConflict?: OnConflict;
}

export abstract class SQLiteIntegerBaseBuilder<
	THKT extends ColumnBuilderHKTBase,
	T extends ColumnBuilderBaseConfig,
> extends SQLiteColumnBuilder<THKT, T, { autoIncrement: boolean }> {
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
	): SQLiteIntegerBase<Assume<THKT['_columnHKT'], ColumnHKTBase>, MakeColumnConfig<T, TTableName>>;
}

export abstract class SQLiteIntegerBase<
	THKT extends ColumnHKTBase,
	T extends ColumnBaseConfig,
> extends SQLiteColumn<THKT, T> {
	readonly autoIncrement: boolean;

	constructor(
		override readonly table: AnySQLiteTable<{ name: T['tableName'] }>,
		config: SQLiteIntegerBaseBuilder<ColumnBuilderHKTBase, T>['config'],
	) {
		super(table, config);
		this.autoIncrement = config.autoIncrement;
	}

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
	extends SQLiteIntegerBaseBuilder<SQLiteIntegerBuilderHKT, T>
{
	build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteInteger<MakeColumnConfig<T, TTableName>> {
		return new SQLiteInteger<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class SQLiteInteger<T extends ColumnBaseConfig> extends SQLiteIntegerBase<SQLiteIntegerHKT, T> {}

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
	extends SQLiteIntegerBaseBuilder<SQLiteTimestampBuilderHKT, T>
{
	/**
	 * @deprecated Use `defaultCurrentTimestamp()` or `default()` with your own expression instead.
	 *
	 * Adds `DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))` to the column, which is the current epoch timestamp in milliseconds.
	 */
	defaultNow(): ColumnBuilderKind<this['_']['hkt'], UpdateCBConfig<T, { hasDefault: true }>> {
		return this.default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`);
	}

	defaultCurrentTimestamp(): ColumnBuilderKind<this['_']['hkt'], UpdateCBConfig<T, { hasDefault: true }>> {
		return this.default(sql`current_timestamp`);
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

export class SQLiteTimestamp<T extends ColumnBaseConfig> extends SQLiteIntegerBase<SQLiteTimestampHKT, T> {
	override mapFromDriverValue(value: number): Date {
		return new Date(value);
	}

	override mapToDriverValue(value: Date): number {
		return value.getTime();
	}
}

export interface IntegerConfig<TMode extends 'number' | 'timestamp' = 'number' | 'timestamp'> {
	mode: TMode;
}

export function integer<TName extends string>(
	name: TName,
	config?: IntegerConfig<'number'>,
): SQLiteIntegerBuilderInitial<TName>;
export function integer<TName extends string>(
	name: TName,
	config?: IntegerConfig<'timestamp'>,
): SQLiteTimestampBuilderInitial<TName>;
export function integer<TName extends string>(name: TName, config?: IntegerConfig) {
	if (config?.mode === 'timestamp') {
		return new SQLiteTimestampBuilder(name);
	}
	return new SQLiteIntegerBuilder(name);
}

export const int = integer;
