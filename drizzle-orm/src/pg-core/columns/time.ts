import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn } from './common.ts';
import { PgDateColumnBaseBuilder } from './date.common.ts';
import type { Precision } from './timestamp.ts';

export type PgTimeBuilderInitial<TName extends string> = PgTimeBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'PgTime';
		data: string;
		driverParam: string;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class PgTimeBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgTime'>> extends PgDateColumnBaseBuilder<
	T,
	{ withTimezone: boolean; precision: number | undefined }
> {
	static readonly [entityKind]: string = 'PgTimeBuilder';

	constructor(
		name: T['name'],
		readonly withTimezone: boolean,
		readonly precision: number | undefined,
	) {
		super(name, 'string', 'PgTime');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgTime<MakeColumnConfig<T, TTableName>> {
		return new PgTime<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgTime<T extends ColumnBaseConfig<'string', 'PgTime'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgTime';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgTimeBuilder<T>['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `time${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}
}

export interface TimeConfig {
	precision?: Precision;
	withTimezone?: boolean;
}

export function time<TName extends string>(name: TName, config: TimeConfig = {}): PgTimeBuilderInitial<TName> {
	return new PgTimeBuilder(name, config.withTimezone ?? false, config.precision);
}
