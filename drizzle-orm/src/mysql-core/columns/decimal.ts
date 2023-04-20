import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyMySqlTable } from '~/mysql-core/table';
import type { Assume } from '~/utils';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common';

export interface MySqlDecimalBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlDecimalBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlDecimalHKT;
}

export interface MySqlDecimalHKT extends ColumnHKTBase {
	_type: MySqlDecimal<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlDecimalBuilderInitial<TName extends string> = MySqlDecimalBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlDecimalBuilder<T extends ColumnBuilderBaseConfig>
	extends MySqlColumnBuilderWithAutoIncrement<MySqlDecimalBuilderHKT, T, MySqlDecimalConfig>
{
	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name);
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDecimal<MakeColumnConfig<T, TTableName>> {
		return new MySqlDecimal<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlDecimal<T extends ColumnBaseConfig>
	extends MySqlColumnWithAutoIncrement<MySqlDecimalHKT, T, MySqlDecimalConfig>
{
	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'decimal';
		} else {
			return `decimal(${this.precision})`;
		}
	}
}

export interface MySqlDecimalConfig {
	precision?: number;
	scale?: number;
}

export function decimal<TName extends string>(
	name: TName,
	config: MySqlDecimalConfig = {},
): MySqlDecimalBuilderInitial<TName> {
	return new MySqlDecimalBuilder(name, config.precision, config.scale);
}
