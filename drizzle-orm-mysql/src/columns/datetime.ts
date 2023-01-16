import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlDateTimeBuilder extends MySqlColumnBuilder<
	ColumnBuilderConfig<{ data: Date; driverParam: string | number }>,
	{ fsp: number | undefined }
> {
	constructor(
		name: string,
		fsp: number | undefined,
	) {
		super(name);
		this.config.fsp = fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDateTime<TTableName> {
		return new MySqlDateTime(table, this.config);
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
		config: MySqlDateTimeBuilder['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
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
	extends MySqlColumnBuilder<
		ColumnBuilderConfig<{ data: string; driverParam: string | number }>,
		{ fsp: number | undefined }
	>
{
	constructor(
		name: string,
		fsp: number | undefined,
	) {
		super(name);
		this.config.fsp = fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDateTimeString<TTableName> {
		return new MySqlDateTimeString(table, this.config);
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
		config: MySqlDateTimeStringBuilder['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
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
	config: { mode: 'string'; fsp?: DatetimeFsp },
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
