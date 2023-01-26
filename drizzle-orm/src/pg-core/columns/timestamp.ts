import { ColumnConfig } from '~/column';
import { ColumnBuilderConfig } from '~/column-builder';
import { AnyPgTable } from '~/pg-core/table';
import { PgColumn } from './common';
import { PgDateColumnBaseBuilder } from './date.common';

export class PgTimestampBuilder extends PgDateColumnBaseBuilder<
	ColumnBuilderConfig<{ data: Date; driverParam: string }>,
	{ withTimezone: boolean; precision: number | undefined }
> {
	protected override $pgColumnBuilderBrand!: 'PgTimestampBuilder';

	constructor(
		name: string,
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name);
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgTimestamp<TTableName> {
		return new PgTimestamp(table, this.config);
	}
}

export class PgTimestamp<TTableName extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: Date; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgTimestamp';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: TTableName }>, config: PgTimestampBuilder['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = typeof this.precision !== 'undefined' ? ` (${this.precision})` : '';
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue = (value: string): Date => {
		return new Date(value);
	};
}

export class PgTimestampStringBuilder extends PgDateColumnBaseBuilder<
	ColumnBuilderConfig<{ data: string; driverParam: string }>,
	{ withTimezone: boolean; precision: number | undefined }
> {
	protected override $pgColumnBuilderBrand!: 'PgTimestampStringBuilder';

	constructor(
		name: string,
		withTimezone: boolean,
		precision: number | undefined,
	) {
		super(name);
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgTimestampString<TTableName> {
		return new PgTimestampString(table, this.config);
	}
}

export class PgTimestampString<TTableName extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: string; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgTimestampString';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: TTableName }>, config: PgTimestampStringBuilder['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = typeof this.precision !== 'undefined' ? ` (${this.precision})` : '';
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}
}

export type Precision = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function timestamp(name: string): PgTimestampBuilder;
export function timestamp(
	name: string,
	config: { mode: 'string'; precision?: Precision; withTimezone?: boolean },
): PgTimestampStringBuilder;
export function timestamp(
	name: string,
	config: { mode?: 'date'; precision?: Precision; withTimezone?: boolean },
): PgTimestampBuilder;
export function timestamp(
	name: string,
	config?: { mode?: 'date' | 'string'; precision?: Precision; withTimezone?: boolean },
) {
	if (config?.mode === 'string') {
		return new PgTimestampStringBuilder(name, config.withTimezone ?? false, config.precision);
	}
	return new PgTimestampBuilder(name, config?.withTimezone ?? false, config?.precision);
}
