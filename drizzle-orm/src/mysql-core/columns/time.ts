import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export class MySqlTimeBuilder extends MySqlColumnBuilder<
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
	): MySqlTime<TTableName> {
		return new MySqlTime(table, this.config);
	}
}

export class MySqlTime<
	TTableName extends string,
> extends MySqlColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: string;
		driverParam: number | string;
	}>
> {
	protected override $mySqlColumnBrand!: 'MySqlTime';

	readonly fsp: number | undefined;

	constructor(
		table: AnyMySqlTable<{ name: TTableName }>,
		config: MySqlTimeBuilder['config'],
	) {
		super(table, config);
		this.fsp = config.fsp;
	}

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? `(${this.fsp})` : '';
		return `time${precision}`;
	}
}

export type TimeConfig = {
	fsp?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export function time(name: string, config?: TimeConfig) {
	return new MySqlTimeBuilder(name, config?.fsp);
}
