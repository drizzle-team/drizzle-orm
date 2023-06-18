import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyMySqlTable } from '~/mysql-core/table';
import { type Assume } from '~/utils';
import { MySqlColumn, MySqlColumnBuilder } from './common';

export interface MySqlJsonBuilderHKT extends ColumnBuilderHKTBase {
	_type: MySqlJsonBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: MySqlJsonHKT;
}

export interface MySqlJsonHKT extends ColumnHKTBase {
	_type: MySqlJson<Assume<this['config'], ColumnBaseConfig>>;
}

export type MySqlJsonBuilderInitial<TName extends string> = MySqlJsonBuilder<{
	name: TName;
	data: unknown;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class MySqlJsonBuilder<T extends ColumnBuilderBaseConfig> extends MySqlColumnBuilder<MySqlJsonBuilderHKT, T> {
	static readonly [entityKind]: string = 'MySqlJsonBuilder';

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlJson<MakeColumnConfig<T, TTableName>> {
		return new MySqlJson<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class MySqlJson<T extends ColumnBaseConfig> extends MySqlColumn<MySqlJsonHKT, T> {
	static readonly [entityKind]: string = 'MySqlJson';

	declare protected $mysqlColumnBrand: 'MySqlJson';

	getSQLType(): string {
		return 'json';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export function json<TName extends string>(name: TName): MySqlJsonBuilderInitial<TName> {
	return new MySqlJsonBuilder(name);
}
