import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgSmallIntBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgSmallIntBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgSmallIntHKT;
}

export interface PgSmallIntHKT extends ColumnHKTBase {
	_type: PgSmallInt<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgSmallIntBuilderInitial<TName extends string> = PgSmallIntBuilder<{
	name: TName;
	data: number;
	driverParam: number | string;
	notNull: false;
	hasDefault: false;
}>;

export class PgSmallIntBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgSmallIntBuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgSmallInt<MakeColumnConfig<T, TTableName>> {
		return new PgSmallInt<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgSmallInt<T extends ColumnBaseConfig> extends PgColumn<PgSmallIntHKT, T> {
	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue = (value: number | string): number => {
		if (typeof value === 'string') {
			return parseInt(value);
		}
		return value;
	};
}

export function smallint<TName extends string>(name: TName): PgSmallIntBuilderInitial<TName> {
	return new PgSmallIntBuilder(name);
}
