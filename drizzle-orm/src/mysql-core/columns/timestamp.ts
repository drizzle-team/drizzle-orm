import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumn } from './common';
import { MySqlDateBaseColumn, MySqlDateColumnBaseBuilder } from './date.common';
export class MySqlTimestampBuilder extends MySqlDateColumnBaseBuilder<
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
	): MySqlTimestamp<TTableName> {
		return new MySqlTimestamp(table, this.config);
	}
}

export class MySqlTimestamp<
	TTableName extends string,
> extends MySqlDateBaseColumn<
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
		config: MySqlTimestampBuilder['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? `(${this.fsp})` : '';
		return `timestamp${precision}`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value + '+0000');
	}
}

export class MySqlTimestampStringBuilder extends MySqlDateColumnBaseBuilder<
	ColumnBuilderConfig<{ data: string; driverParam: string | number }>,
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
	): MySqlTimestampString<TTableName> {
		return new MySqlTimestampString(table, this.config);
	}
}

export class MySqlTimestampString<
	TTableName extends string,
> extends MySqlDateBaseColumn<
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
		config: MySqlTimestampStringBuilder['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? `(${this.fsp})` : '';
		return `timestamp${precision}`;
	}
}

export type TimestampFsp = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export function timestamp(name: string): MySqlTimestampBuilder;
export function timestamp(
	name: string,
	config: { mode: 'string'; fsp?: TimestampFsp },
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
