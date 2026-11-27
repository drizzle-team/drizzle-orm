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

	override mapFromDriverValue(value: Date | string): Date {
		if (typeof value === 'string') return new Date(this.withTimezone ? value : value + '+0000');

		return value;
	}

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

	override mapFromDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;

		const shortened = value.toISOString().slice(0, -1).replace('T', ' ');
		if (this.withTimezone) {
			const offset = value.getTimezoneOffset();
			const sign = offset <= 0 ? '+' : '-';
			return `${shortened}${sign}${Math.floor(Math.abs(offset) / 60).toString().padStart(2, '0')}`;
		}

		return shortened;
	}
}

export type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface PgTimestampConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
	precision?: Precision;
	withTimezone?: boolean;
}

export function timestamp(): PgTimestampBuilderInitial<''>;
export function timestamp<TMode extends PgTimestampConfig['mode'] & {}>(
	config?: PgTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? PgTimestampStringBuilderInitial<''> : PgTimestampBuilderInitial<''>;
export function timestamp<TName extends string, TMode extends PgTimestampConfig['mode'] & {}>(
	name: TName,
	config?: PgTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? PgTimestampStringBuilderInitial<TName> : PgTimestampBuilderInitial<TName>;
export function timestamp(a?: string | PgTimestampConfig, b: PgTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<PgTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new PgTimestampStringBuilder(name, config.withTimezone ?? false, config.precision);
	}
	return new PgTimestampBuilder(name, config?.withTimezone ?? false, config?.precision);
}
