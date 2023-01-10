import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlDateTimeBuilder
	extends MySqlColumnBuilder<ColumnBuilderConfig<{ data: Date; driverParam: string | number }>>
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
	): MySqlDateTime<TTableName> {
		return new MySqlDateTime(table, this);
	}
}

export class MySqlDateTime<
	TTableName extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: Date;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlDateTime';

	readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<{ name: TTableName }>,
		builder: MySqlDateTimeBuilder,
	) {
		super(table, builder);
		this.fsp = builder.fsp;
	}

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? ` (${this.fsp})` : '';
		return `datetime${precision}`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}
}

export class MySqlDateTimeStringBuilder
	extends MySqlColumnBuilder<ColumnBuilderConfig<{ data: string; driverParam: string | number }>>
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
	): MySqlDateTimeString<TTableName> {
		return new MySqlDateTimeString(table, this);
	}
}

export class MySqlDateTimeString<
	TTableName extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: string;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlDateTimeString';

	readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<{ name: TTableName }>,
		builder: MySqlDateTimeStringBuilder,
	) {
		super(table, builder);
		this.fsp = builder.fsp;
	}

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? ` (${this.fsp})` : '';
		return `datetime${precision}`;
	}
}

export type DatetimeFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function datetime(name: string): MySqlDateTimeBuilder;
export function datetime(
	name: string,
	config: { mode: 'string'; fsp?: DatetimeFsp},
): MySqlDateTimeStringBuilder;
export function datetime(
	name: string,
	config: { mode?: 'date'; fsp?: DatetimeFsp },
): MySqlDateTimeBuilder;
export function datetime(
	name: string,
	config?: { mode?: 'date' | 'string'; fsp?: DatetimeFsp },
) {
	if (config?.mode === 'string') {
		return new MySqlDateTimeStringBuilder(name, config.fsp);
	}
	return new MySqlDateTimeBuilder(name, config?.fsp);
}
