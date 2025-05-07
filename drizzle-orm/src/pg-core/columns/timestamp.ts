import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn } from './common.ts';
import { PgDateColumnBaseBuilder } from './date.common.ts';

export type PgTimestampBuilderInitial<TName extends string> = PgTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'PgTimestamp';
	data: Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'PgTimestamp'>>
	extends PgDateColumnBaseBuilder<
		T,
		{ withTimezone: boolean; precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'PgTimestampBuilder';

	constructor(
		name: T['name'],
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'date', 'PgTimestamp');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgTimestamp<MakeColumnConfig<T, TTableName>> {
		return new PgTimestamp<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgTimestamp<T extends ColumnBaseConfig<'date', 'PgTimestamp'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgTimestamp';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgTimestampBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : ` (${this.precision})`;
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue = (value: string): Date | null => {
		return new Date(this.withTimezone ? value : value + '+0000');
	};

	override mapToDriverValue = (value: Date): string => {
		return value.toISOString();
	};
}

export type PgTimestampStringBuilderInitial<TName extends string> = PgTimestampStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgTimestampString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgTimestampStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgTimestampString'>>
	extends PgDateColumnBaseBuilder<
		T,
		{ withTimezone: boolean; precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'PgTimestampStringBuilder';

	constructor(
		name: T['name'],
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name, 'string', 'PgTimestampString');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgTimestampString<MakeColumnConfig<T, TTableName>> {
		return new PgTimestampString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgTimestampString<T extends ColumnBaseConfig<'string', 'PgTimestampString'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgTimestampString';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgTimestampStringBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}
}

export type PgInstantTimestampBuilderInitial<TName extends string> = PgInstantTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'PgInstantTimestamp';
	data: Temporal.Instant;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgInstantTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'PgInstantTimestamp'>>
	extends PgDateColumnBaseBuilder<
		T,
		{ precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'PgInstantTimestampBuilder';

	constructor(
		name: T['name'],
		precision: number | undefined,
	) {
		super(name, 'date', 'PgInstantTimestamp');
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgInstantTimestamp<MakeColumnConfig<T, TTableName>> {
		return new PgInstantTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgInstantTimestamp<T extends ColumnBaseConfig<'date', 'PgInstantTimestamp'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgInstantTimestamp';

	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgInstantTimestampBuilder<T>['config']) {
		super(table, config);
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : ` (${this.precision})`;
		return `timestamp${precision} with time zone`;
	}

	override mapFromDriverValue = (value: string): Temporal.Instant => {
		return Temporal.Instant.from(value);
	};

	override mapToDriverValue = (value: Temporal.Instant): string => {
		return value.toString();
	};
}

export type PgPlainTimestampBuilderInitial<TName extends string> = PgPlainTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'PgPlainTimestamp';
	data: Temporal.PlainDateTime;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgPlainTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'PgPlainTimestamp'>>
	extends PgDateColumnBaseBuilder<
		T,
		{ precision: number | undefined }
	>
{
	static override readonly [entityKind]: string = 'PgPlainTimestampBuilder';

	constructor(
		name: T['name'],
		precision: number | undefined,
	) {
		super(name, 'date', 'PgPlainTimestamp');
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgPlainTimestamp<MakeColumnConfig<T, TTableName>> {
		return new PgPlainTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgPlainTimestamp<T extends ColumnBaseConfig<'date', 'PgPlainTimestamp'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgPlainTimestamp';

	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgPlainTimestampBuilder<T>['config']) {
		super(table, config);
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : ` (${this.precision})`;
		return `timestamp${precision}`;
	}

	override mapFromDriverValue = (value: string): Temporal.PlainDateTime => {
		return Temporal.PlainDateTime.from(value);
	};

	override mapToDriverValue = (value: Temporal.PlainDateTime): string => {
		return value.toString();
	};
}

export type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PgTimestampConfig<
	TMode extends 'date' | 'string' | 'temporal' = 'date' | 'string' | 'temporal',
	TWithTimezone extends boolean = boolean,
> {
	mode?: TMode;
	precision?: Precision;
	withTimezone?: TWithTimezone;
}

export function timestamp(): PgTimestampBuilderInitial<''>;
export function timestamp<
	TMode extends PgTimestampConfig['mode'] & {},
	TWithTimezone extends PgTimestampConfig['withTimezone'] & {},
>(
	config?: PgTimestampConfig<TMode, TWithTimezone>,
): Equal<TMode, 'string'> extends true ? PgTimestampStringBuilderInitial<''>
	: Equal<TMode, 'temporal'> extends true
		? Equal<TWithTimezone, true> extends true ? PgInstantTimestampBuilderInitial<''>
		: PgPlainTimestampBuilderInitial<''>
	: PgTimestampBuilderInitial<''>;
export function timestamp<
	TName extends string,
	TMode extends PgTimestampConfig['mode'] & {},
	TWithTimezone extends PgTimestampConfig['withTimezone'] & {},
>(
	name: TName,
	config?: PgTimestampConfig<TMode, TWithTimezone>,
): Equal<TMode, 'string'> extends true ? PgTimestampStringBuilderInitial<TName>
	: Equal<TMode, 'temporal'> extends true
		? Equal<TWithTimezone, true> extends true ? PgInstantTimestampBuilderInitial<TName>
		: PgPlainTimestampBuilderInitial<TName>
	: PgTimestampBuilderInitial<TName>;
export function timestamp(a?: string | PgTimestampConfig, b: PgTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<PgTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new PgTimestampStringBuilder(name, config.withTimezone ?? false, config.precision);
	} else if (config?.mode === 'temporal') {
		if (config.withTimezone === true) {
			return new PgInstantTimestampBuilder(name, config.precision);
		}
		return new PgPlainTimestampBuilder(name, config.precision);
	}
	return new PgTimestampBuilder(name, config?.withTimezone ?? false, config?.precision);
}
