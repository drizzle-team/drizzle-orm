import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyPgTable } from '~/pg-core/table';
import { type Assume } from '~/utils';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgSerialBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgSerialBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgSerialHKT;
}

export interface PgSerialHKT extends ColumnHKTBase {
	_type: PgSerial<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgSerialBuilderInitial<TName extends string> = PgSerialBuilder<{
	name: TName;
	data: number;
	driverParam: number;
	notNull: true;
	hasDefault: true;
}>;

export interface PgSerialBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgSerialBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgSerialHKT;
}

export interface PgSerialHKT extends ColumnHKTBase {
	_type: PgSerial<Assume<this['config'], ColumnBaseConfig>>;
}

export class PgSerialBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgSerialBuilderHKT, T> {
	static readonly [entityKind]: string = 'PgSerialBuilder';

	constructor(name: string) {
		super(name);
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgSerial<MakeColumnConfig<T, TTableName>> {
		return new PgSerial<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgSerial<T extends ColumnBaseConfig> extends PgColumn<PgSerialHKT, T> {
	static readonly [entityKind]: string = 'PgSerial';

	getSQLType(): string {
		return 'serial';
	}
}

export function serial<TName extends string>(name: TName): PgSerialBuilderInitial<TName> {
	return new PgSerialBuilder(name);
}
