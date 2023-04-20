import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume } from '~/utils';
import { PgColumn } from './common';
import { PgDateColumnBaseBuilder } from './date.common';
import type { Precision } from './timestamp';

export interface PgTimeBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgTimeBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgTimeHKT;
}

export interface PgTimeHKT extends ColumnHKTBase {
	_type: PgTime<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgTimeBuilderInitial<TName extends string> = PgTimeBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgTimeBuilder<T extends ColumnBuilderBaseConfig> extends PgDateColumnBaseBuilder<
	PgTimeBuilderHKT,
	T,
	{ withTimezone: boolean; precision: number | undefined }
> {
	constructor(
		name: T['name'],
		readonly withTimezone: boolean,
		readonly precision: number | undefined,
	) {
		super(name);
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgTime<MakeColumnConfig<T, TTableName>> {
		return new PgTime<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgTime<T extends ColumnBaseConfig> extends PgColumn<PgTimeHKT, T> {
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
