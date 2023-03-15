import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import { PgColumn } from './common';
import { PgDateColumnBaseBuilder } from './date.common';
import type { Precision } from './timestamp';

export class PgTimeBuilder<TData extends string = string> extends PgDateColumnBaseBuilder<
	ColumnBuilderConfig<{ data: TData; driverParam: string }>,
	{ withTimezone: boolean; precision: number | undefined }
> {
	protected override $pgColumnBuilderBrand!: 'PgTimeBuilder';

	constructor(
		name: string,
		readonly withTimezone: boolean,
		readonly precision: number | undefined,
	) {
		super(name);
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgTime<TTableName, TData> {
		return new PgTime(table, this.config);
	}
}

export class PgTime<TTableName extends string, TData extends string>
	extends PgColumn<ColumnConfig<{ tableName: TTableName; data: TData; driverParam: string }>>
{
	protected override $pgColumnBrand!: 'PgTime';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: TTableName }>, config: PgTimeBuilder<TData>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = typeof this.precision !== 'undefined' ? `(${this.precision})` : '';
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
