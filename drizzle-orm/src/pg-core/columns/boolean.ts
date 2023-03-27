import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';

import type { AnyPgTable } from '~/pg-core/table';
import type { Assume } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgBooleanBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgBooleanBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgBooleanHKT;
}

export interface PgBooleanHKT extends ColumnHKTBase {
	_type: PgBoolean<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgBooleanBuilderInitial<TName extends string> = PgBooleanBuilder<{
	name: TName;
	data: boolean;
	driverParam: boolean;
	notNull: false;
	hasDefault: false;
}>;

export class PgBooleanBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgBooleanBuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgBoolean<MakeColumnConfig<T, TTableName>> {
		return new PgBoolean<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgBoolean<T extends ColumnBaseConfig> extends PgColumn<PgBooleanHKT, T> {
	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean<TName extends string>(name: TName): PgBooleanBuilderInitial<TName> {
	return new PgBooleanBuilder(name);
}
