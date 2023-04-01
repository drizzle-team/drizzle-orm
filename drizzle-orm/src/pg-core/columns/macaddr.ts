import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { Assume } from '~/utils';
import type { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgMacaddrBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgMacaddrBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgMacaddrHKT;
}

export interface PgMacaddrHKT extends ColumnHKTBase {
	_type: PgMacaddr<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgMacaddrBuilderInitial<TName extends string> = PgMacaddrBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgMacaddrBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgMacaddrBuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgMacaddr<MakeColumnConfig<T, TTableName>> {
		return new PgMacaddr<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgMacaddr<T extends ColumnBaseConfig> extends PgColumn<PgMacaddrHKT, T> {
	getSQLType(): string {
		return 'macaddr';
	}
}

export function macaddr<TName extends string>(name: TName): PgMacaddrBuilderInitial<TName> {
	return new PgMacaddrBuilder(name);
}
