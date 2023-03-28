import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { Assume } from '~/utils';
import type { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgInetBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgInetBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgInetHKT;
}

export interface PgInetHKT extends ColumnHKTBase {
	_type: PgInet<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgInetBuilderInitial<TName extends string> = PgInetBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgInetBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgInetBuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgInet<MakeColumnConfig<T, TTableName>> {
		return new PgInet<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgInet<T extends ColumnBaseConfig> extends PgColumn<PgInetHKT, T> {
	getSQLType(): string {
		return 'inet';
	}
}

export function inet<TName extends string>(name: TName): PgInetBuilderInitial<TName> {
	return new PgInetBuilder(name);
}
