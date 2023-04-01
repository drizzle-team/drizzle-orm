import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgSmallSerialBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgSmallSerialBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgSmallSerialHKT;
}

export interface PgSmallSerialHKT extends ColumnHKTBase {
	_type: PgSmallSerial<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgSmallSerialBuilderInitial<TName extends string> = PgSmallSerialBuilder<{
	name: TName;
	data: number;
	driverParam: number;
	notNull: false;
	hasDefault: false;
}>;

export class PgSmallSerialBuilder<T extends ColumnBuilderBaseConfig>
	extends PgColumnBuilder<PgSmallSerialBuilderHKT, T>
{
	constructor(name: string) {
		super(name);
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgSmallSerial<MakeColumnConfig<T, TTableName>> {
		return new PgSmallSerial<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgSmallSerial<T extends ColumnBaseConfig> extends PgColumn<PgSmallSerialHKT, T> {
	getSQLType(): string {
		return 'serial';
	}
}

export function smallserial<TName extends string>(name: TName): PgSmallSerialBuilderInitial<TName> {
	return new PgSmallSerialBuilder(name);
}
