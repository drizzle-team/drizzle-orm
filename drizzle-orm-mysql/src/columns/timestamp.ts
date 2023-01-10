import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn } from './common';
import { MySqlDateColumnBaseBuilder } from './date.common';
export class MySqlTimestampBuilder
	extends MySqlDateColumnBaseBuilder<ColumnBuilderConfig<{ data: Date; driverParam: string | number }>>
{
	constructor(
		name: string,
		readonly fsp: number | undefined,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlTimestamp<TTableName> {
		return new MySqlTimestamp(table, this);
	}
}

export class MySqlTimestamp<
	TTableName extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: Date;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlTimestamp';

	readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<{ name: TTableName }>,
		builder: MySqlTimestampBuilder,
	) {
		super(table, builder);
		this.fsp = builder.fsp;
	}

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? ` (${this.fsp})` : '';
		return `timestamp${precision}`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}
}

export class MySqlTimestampStringBuilder
	extends MySqlDateColumnBaseBuilder<ColumnBuilderConfig<{ data: string; driverParam: string | number }>>
{
	constructor(
		name: string,
		readonly fsp: number | undefined,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlTimestampString<TTableName> {
		return new MySqlTimestampString(table, this);
	}
}

export class MySqlTimestampString<
	TTableName extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: string;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlTimestampString';

	readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<{ name: TTableName }>,
		builder: MySqlTimestampStringBuilder,
	) {
		super(table, builder);
		this.fsp = builder.fsp;
	}

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? ` (${this.fsp})` : '';
		return `timestamp${precision}`;
	}
}

export type TimestampFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function timestamp(name: string): MySqlTimestampBuilder;
export function timestamp(
	name: string,
	config: { mode: 'string'; fsp?: TimestampFsp},
): MySqlTimestampStringBuilder;
export function timestamp(
	name: string,
	config: { mode?: 'date'; fsp?: TimestampFsp },
): MySqlTimestampBuilder;
export function timestamp(
	name: string,
	config?: { mode?: 'date' | 'string'; fsp?: TimestampFsp },
) {
	if (config?.mode === 'string') {
		return new MySqlTimestampStringBuilder(name, config.fsp);
	}
	return new MySqlTimestampBuilder(name, config?.fsp);
}
