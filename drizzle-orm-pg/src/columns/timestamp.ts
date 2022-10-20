import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyPgTable } from '~/table';
import { PgColumn } from './common';
import { PgDateColumnBaseBuilder } from './date.common';

export class PgTimestampBuilder
	extends PgDateColumnBaseBuilder<ColumnBuilderConfig<{ data: Date; driverParam: string }>>
{
	constructor(
		name: string,
		public readonly withTimezone: boolean,
		public readonly precision: number | undefined,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgTimestamp<TTableName> {
		return new PgTimestamp(table, this);
	}
}

export class PgTimestamp<TTableName extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: Date; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgTimestamp';

	public readonly withTimezone: boolean;
	public readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: TTableName }>, builder: PgTimestampBuilder) {
		super(table, builder);
		this.withTimezone = builder.withTimezone;
		this.precision = builder.precision;
	}

	getSQLType(): string {
		const precision = typeof this.precision !== 'undefined' ? ` (${this.precision})` : '';
		return `timestamp${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}

	override mapFromDriverValue = (value: string): Date => {
		return new Date(value);
	};
}

export class PgTimestampStringBuilder
	extends PgDateColumnBaseBuilder<ColumnBuilderConfig<{ data: string; driverParam: string }>>
{
	constructor(
		name: string,
		public readonly withTimezone: boolean,
		public readonly precision: number | undefined,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgTimestampString<TTableName> {
		return new PgTimestampString(table, this);
	}
}

export class PgTimestampString<TTableName extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: string; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgTimestampString';

	public readonly withTimezone: boolean;
	public readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: TTableName }>, builder: PgTimestampStringBuilder) {
		super(table, builder);
		this.withTimezone = builder.withTimezone;
		this.precision = builder.precision;
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
