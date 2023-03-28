import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { Assume } from '~/utils';
import type { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgMacaddr8BuilderHKT extends ColumnBuilderHKTBase {
	_type: PgMacaddr8Builder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgMacaddr8HKT;
}

export interface PgMacaddr8HKT extends ColumnHKTBase {
	_type: PgMacaddr8<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgMacaddr8BuilderInitial<TName extends string> = PgMacaddr8Builder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgMacaddr8Builder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgMacaddr8BuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgMacaddr8<MakeColumnConfig<T, TTableName>> {
		return new PgMacaddr8<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgMacaddr8<T extends ColumnBaseConfig> extends PgColumn<PgMacaddr8HKT, T> {
	getSQLType(): string {
		return 'macaddr8';
	}
}

export function macaddr8<TName extends string>(name: TName): PgMacaddr8BuilderInitial<TName> {
	return new PgMacaddr8Builder(name);
}
