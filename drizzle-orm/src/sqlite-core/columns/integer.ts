import type { ColumnBuilderBaseConfig, ColumnType, HasDefault, IsPrimaryKey, NotNull } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { sql } from '~/sql/sql.ts';
import type { OnConflict } from '~/sqlite-core/utils.ts';
import { type Equal, getColumnNameAndConfig, type Or, type Writable } from '~/utils.ts';
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

	override primaryKey(
		config?: PrimaryKeyConfig,
	): IsPrimaryKey<HasDefault<NotNull<this>>> {
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

export class SQLiteIntegerBuilder<
	TEnum extends [number, ...number[]] = [number, ...number[]],
> extends SQLiteBaseIntegerBuilder<
	{
		dataType: 'number int53';
		data: TEnum[number];
		driverParam: number;
		enumValues: TEnum;
	},
	{ enumValues: TEnum | undefined }
> {
	static override readonly [entityKind]: string = 'SQLiteIntegerBuilder';

	constructor(name: string, config: IntegerConfig<'number', TEnum>) {
		super(name, 'number int53', 'SQLiteInteger');
		this.config.enumValues = config.enum;
	}

	override build(table: SQLiteTable) {
		return new SQLiteInteger(table, this.config as any);
	}
}

export class SQLiteInteger<
	T extends ColumnBaseConfig<'number int53'>,
> extends SQLiteBaseInteger<T, { enumValues: T['enumValues'] }> {
	static override readonly [entityKind]: string = 'SQLiteInteger';
	override readonly enumValues;

	constructor(table: SQLiteTable<any>, config: any, enumValues?: number[]) {
		super(table, config);
		this.enumValues = enumValues;
	}
}

export class SQLiteTimestampBuilder extends SQLiteBaseIntegerBuilder<
	{
		dataType: 'object date';
		data: Date;
		driverParam: number;
	},
	{ mode: 'timestamp' | 'timestamp_ms' }
> {
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
		return this.default(
			sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`,
		) as any;
	}

	override build(table: SQLiteTable) {
		return new SQLiteTimestamp(table, this.config as any);
	}
}

export class SQLiteTimestamp<
	T extends ColumnBaseConfig<'object date'>,
> extends SQLiteBaseInteger<T, { mode: 'timestamp' | 'timestamp_ms' }> {
	static override readonly [entityKind]: string = 'SQLiteTimestamp';

	readonly mode: 'timestamp' | 'timestamp_ms' = this.config.mode;

	override mapFromDriverValue(value: number): Date {
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

export class SQLiteBooleanBuilder extends SQLiteBaseIntegerBuilder<
	{
		dataType: 'boolean';
		data: boolean;
		driverParam: number;
	},
	{ mode: 'boolean' }
> {
	static override readonly [entityKind]: string = 'SQLiteBooleanBuilder';

	constructor(name: string, mode: 'boolean') {
		super(name, 'boolean', 'SQLiteBoolean');
		this.config.mode = mode;
	}

	override build(table: SQLiteTable) {
		return new SQLiteBoolean(table, this.config as any);
	}
}

export class SQLiteBoolean<
	T extends ColumnBaseConfig<'boolean'>,
> extends SQLiteBaseInteger<T, { mode: 'boolean' }> {
	static override readonly [entityKind]: string = 'SQLiteBoolean';

	readonly mode: 'boolean' = this.config.mode;

	override mapFromDriverValue(value: number): boolean {
		return Number(value) === 1;
	}

	override mapToDriverValue(value: boolean): number {
		return value ? 1 : 0;
	}
}

export type IntegerConfig<
	TMode extends 'number' | 'timestamp' | 'timestamp_ms' | 'boolean' =
		| 'number'
		| 'timestamp'
		| 'timestamp_ms'
		| 'boolean',
	TEnum extends readonly number[] | undefined = readonly number[] | undefined,
> = TMode extends 'number' ? {
		mode: TMode;
		enum?: TEnum;
	}
	: {
		mode: TMode;
	};

export function integer<
	TMode extends IntegerConfig['mode'],
	U extends number,
	T extends Readonly<[U, ...U[]]>,
>(
	config?: IntegerConfig<TMode, T | Writable<T>>,
): Or<Equal<TMode, 'timestamp'>, Equal<TMode, 'timestamp_ms'>> extends true ? SQLiteTimestampBuilder
	: Equal<TMode, 'boolean'> extends true ? SQLiteBooleanBuilder
	: SQLiteIntegerBuilder<Writable<T>>;
export function integer<
	TMode extends IntegerConfig['mode'],
	U extends number,
	T extends Readonly<[U, ...U[]]>,
>(
	name: string,
	config?: IntegerConfig<TMode, T | Writable<T>>,
): Or<Equal<TMode, 'timestamp'>, Equal<TMode, 'timestamp_ms'>> extends true ? SQLiteTimestampBuilder
	: Equal<TMode, 'boolean'> extends true ? SQLiteBooleanBuilder
	: SQLiteIntegerBuilder<Writable<T>>;
export function integer(a?: string | IntegerConfig, b?: IntegerConfig) {
	const { name, config } = getColumnNameAndConfig<IntegerConfig | undefined>(
		a,
		b,
	);
	if (config?.mode === 'timestamp' || config?.mode === 'timestamp_ms') {
		return new SQLiteTimestampBuilder(name, config.mode);
	}
	if (config?.mode === 'boolean') {
		return new SQLiteBooleanBuilder(name, config.mode);
	}
	return new SQLiteIntegerBuilder(
		name,
		config as any,
	) as SQLiteIntegerBuilder<any>;
}
