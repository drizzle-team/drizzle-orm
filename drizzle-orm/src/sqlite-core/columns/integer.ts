import type { ColumnBuilderBaseConfig, ColumnType, HasDefault, IsPrimaryKey, NotNull } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import type { OnConflict } from '~/sqlite-core/utils.ts';
import { type Equal, getColumnNameAndConfig, type Or } from '~/utils.ts';
import type { SQLiteTable } from '../table.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export interface PrimaryKeyConfig {
	autoIncrement?: boolean;
	onConflict?: OnConflict;
}

export abstract class SQLiteBaseIntegerBuilder<
	T extends ColumnBuilderBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
> extends SQLiteColumnBuilder<
	T,
	TRuntimeConfig & { autoIncrement: boolean },
	{ primaryKeyHasDefault: true }
> {
	static override readonly [entityKind]: string = 'SQLiteBaseIntegerBuilder';

	constructor(name: string, dataType: T['dataType'], columnType: string) {
		super(name, dataType, columnType);
		this.config.autoIncrement = false;
	}

	override primaryKey(config?: PrimaryKeyConfig): IsPrimaryKey<HasDefault<NotNull<this>>> {
		if (config?.autoIncrement) {
			this.config.autoIncrement = true;
		}
		this.config.hasDefault = true;
		return super.primaryKey() as IsPrimaryKey<HasDefault<NotNull<this>>>;
	}
}

export abstract class SQLiteBaseInteger<
	T extends ColumnBaseConfig<ColumnType>,
	TRuntimeConfig extends object = object,
> extends SQLiteColumn<T, TRuntimeConfig & { autoIncrement: boolean }> {
	static override readonly [entityKind]: string = 'SQLiteBaseInteger';

	readonly autoIncrement: boolean = this.config.autoIncrement;

	getSQLType(): string {
		return 'integer';
	}
}

export class SQLiteIntegerBuilder extends SQLiteBaseIntegerBuilder<{
	dataType: 'number int53';
	data: number;
	driverParam: number;
}> {
	static override readonly [entityKind]: string = 'SQLiteIntegerBuilder';

	constructor(name: string) {
		super(name, 'number int53', 'SQLiteInteger');
	}

	override build(table: SQLiteTable) {
		return new SQLiteInteger(
			table,
			this.config as any,
		);
	}
}

export class SQLiteInteger<T extends ColumnBaseConfig<'number int53'>> extends SQLiteBaseInteger<T> {
	static override readonly [entityKind]: string = 'SQLiteInteger';
}

export class SQLiteTimestampBuilder extends SQLiteBaseIntegerBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: number;
}, { mode: 'timestamp' | 'timestamp_ms' }> {
	static override readonly [entityKind]: string = 'SQLiteTimestampBuilder';

	constructor(name: string, mode: 'timestamp' | 'timestamp_ms') {
		super(name, 'object date', 'SQLiteTimestamp');
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

	override build(table: SQLiteTable) {
		return new SQLiteTimestamp(
			table,
			this.config as any,
		);
	}
}

export class SQLiteTimestamp<T extends ColumnBaseConfig<'object date'>>
	extends SQLiteBaseInteger<T, { mode: 'timestamp' | 'timestamp_ms' }>
{
	static override readonly [entityKind]: string = 'SQLiteTimestamp';

	readonly mode: 'timestamp' | 'timestamp_ms' = this.config.mode;

	override mapFromDriverValue(value: number | string): Date {
		// legacy issue if integer had string date format
		// old kit generated defaults as quoted strings "<string>"
		if (typeof value === 'string') return new Date(value.replaceAll('"', ''));
		if (this.config.mode === 'timestamp') {
			return new Date(value * 1000);
		}
		return new Date(value);
	}

	override mapToDriverValue(value: Date | number): number {
		if (typeof value === 'number') return value;
		const unix = value.getTime();
		if (this.config.mode === 'timestamp') {
			return Math.floor(unix / 1000);
		}
		return unix;
	}
}

export class SQLiteBooleanBuilder extends SQLiteBaseIntegerBuilder<{
	dataType: 'boolean';
	data: boolean;
	driverParam: number;
}, { mode: 'boolean' }> {
	static override readonly [entityKind]: string = 'SQLiteBooleanBuilder';

	constructor(name: string, mode: 'boolean') {
		super(name, 'boolean', 'SQLiteBoolean');
		this.config.mode = mode;
	}

	override build(table: SQLiteTable) {
		return new SQLiteBoolean(
			table,
			this.config as any,
		);
	}
}

export class SQLiteBoolean<T extends ColumnBaseConfig<'boolean'>> extends SQLiteBaseInteger<T, { mode: 'boolean' }> {
	static override readonly [entityKind]: string = 'SQLiteBoolean';

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

export function integer<TMode extends IntegerConfig['mode']>(
	config?: IntegerConfig<TMode>,
): Or<Equal<TMode, 'timestamp'>, Equal<TMode, 'timestamp_ms'>> extends true ? SQLiteTimestampBuilder
	: Equal<TMode, 'boolean'> extends true ? SQLiteBooleanBuilder
	: SQLiteIntegerBuilder;
export function integer<TMode extends IntegerConfig['mode']>(
	name: string,
	config?: IntegerConfig<TMode>,
): Or<Equal<TMode, 'timestamp'>, Equal<TMode, 'timestamp_ms'>> extends true ? SQLiteTimestampBuilder
	: Equal<TMode, 'boolean'> extends true ? SQLiteBooleanBuilder
	: SQLiteIntegerBuilder;
export function integer(a?: string | IntegerConfig, b?: IntegerConfig) {
	const { name, config } = getColumnNameAndConfig<IntegerConfig | undefined>(a, b);
	if (config?.mode === 'timestamp' || config?.mode === 'timestamp_ms') {
		return new SQLiteTimestampBuilder(name, config.mode);
	}
	if (config?.mode === 'boolean') {
		return new SQLiteBooleanBuilder(name, config.mode);
	}
	return new SQLiteIntegerBuilder(name);
}

export const int = integer;
