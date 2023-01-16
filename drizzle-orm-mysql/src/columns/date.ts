import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyMySqlTable } from '~/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlDateBuilder
	extends MySqlColumnBuilder<ColumnBuilderConfig<{ data: Date; driverParam: string | number }>>
{
	constructor(
		name: string,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDate<TTableName> {
		return new MySqlDate(table, this.config);
	}
}

export class MySqlDate<
	TTableName extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: Date;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlDate';

	constructor(
		table: AnyMySqlTable<{ name: TTableName }>,
		config: MySqlDateBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}
}

export class MySqlDateStringBuilder
	extends MySqlColumnBuilder<ColumnBuilderConfig<{ data: string; driverParam: string | number }>>
{
	constructor(
		name: string,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlStringDate<TTableName> {
		return new MySqlStringDate(table, this.config);
	}
}

export class MySqlStringDate<
	TTableName extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: string;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlDateString';

	constructor(
		table: AnyMySqlTable<{ name: TTableName }>,
		config: MySqlDateStringBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}
}

export function date(
	name: string,
): MySqlDateBuilder;
export function date(
	name: string,
	config: { mode: 'string' },
): MySqlDateStringBuilder;
export function date(
	name: string,
	config: { mode: 'date' },
): MySqlDateBuilder;
export function date(
	name: string,
	config?: { mode?: 'date' | 'string' },
) {
	if (config?.mode === 'string') {
		return new MySqlDateStringBuilder(name);
	}
	return new MySqlDateBuilder(name);
}
