import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { Assume } from '~/utils';
import type { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgIntegerBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgIntegerBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgIntegerHKT;
}

export interface PgIntegerHKT extends ColumnHKTBase {
	_type: PgInteger<Assume<this['config'], ColumnBaseConfig>>;
}

type PgIntegerBuilderInitial<TName extends string> = PgIntegerBuilder<{
	name: TName;
	data: number;
	driverParam: number | string;
	hasDefault: false;
	notNull: false;
}>;

export class PgIntegerBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgIntegerBuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgInteger<MakeColumnConfig<T, TTableName>> {
		return new PgInteger<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgInteger<T extends ColumnBaseConfig> extends PgColumn<PgIntegerHKT, T> {
	getSQLType(): string {
		return 'integer';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number.parseInt(value);
		}
		return value;
	}
}

export function integer<TName extends string>(name: TName): PgIntegerBuilderInitial<TName> {
	return new PgIntegerBuilder(name);
}
