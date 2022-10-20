import { ColumnConfig } from 'drizzle-orm';
import { ColumnBuilderConfig } from 'drizzle-orm/column-builder';
import { AnyPgTable } from '~/table';
import { PgColumn } from './common';
import { PgDateColumnBaseBuilder } from './date.common';
import { Precision } from './timestamp';

export class PgTimeBuilder<TData extends string = string>
	extends PgDateColumnBaseBuilder<ColumnBuilderConfig<{ data: TData; driverParam: string }>>
{
	constructor(
		name: string,
		public readonly withTimezone: boolean,
		public readonly precision: number | undefined,
	) {
		super(name);
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgTime<TTableName, TData> {
		return new PgTime(table, this);
	}
}

export class PgTime<TTableName extends string, TData extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgTime';

	public readonly withTimezone: boolean;
	public readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: TTableName }>, builder: PgTimeBuilder<TData>) {
		super(table, builder);
		this.withTimezone = builder.withTimezone;
		this.precision = builder.precision;
	}

	getSQLType(): string {
		const precision = typeof this.precision !== 'undefined' ? ` (${this.precision})` : '';
		return `time${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}
}

export interface TimeConfig {
	precision?: Precision;
	withTimezone?: boolean;
}

export function time(name: string, config: TimeConfig = {}) {
	return new PgTimeBuilder(name, config.withTimezone ?? false, config.precision);
}
