import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlTimeBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlTimeBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlTimeHKT;
}

export interface MySqlTimeHKT extends ColumnHKTBase {
	_type: MySqlTime<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlTimeBuilderInitial<TName extends string> = MySqlTimeBuilder<{
	name: TName;
	data: string;
	driverParam: string | number;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlTimeBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilder<
	MySqlTimeBuilderHKT,
	T,
	TimeConfig
> {
	constructor(
		name: T['name'],
		config: TimeConfig | undefined,
	) {
		super(name);
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlTime<MakeColumnConfig<T, TTableName>> {
		return new MySqlTime<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlTime<
	T extends ColumnBaseConfig,
> extends MySqlColumn<MySqlTimeHKT, T, TimeConfig> {
	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = typeof this.fsp !== 'undefined' ? `(${this.fsp})` : '';
		return `time${precision}`;
	}
}

export type TimeConfig = {
	fsp?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export function time<TName extends string>(name: TName, config?: TimeConfig): MySqlTimeBuilderInitial<TName> {
	return new MySqlTimeBuilder(name, config);
}
