import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import { type Assume } from '~/utils';
import type { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgCidrBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgCidrBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgCidrHKT;
}

export interface PgCidrHKT extends ColumnHKTBase {
	_type: PgCidr<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgCidrBuilderInitial<TName extends string> = PgCidrBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgCidrBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgCidrBuilderHKT, T> {
	static readonly [entityKind]: string = 'PgCidrBuilder';

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgCidr<MakeColumnConfig<T, TTableName>> {
		return new PgCidr<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgCidr<T extends ColumnBaseConfig> extends PgColumn<PgCidrHKT, T> {
	static readonly [entityKind]: string = 'PgCidr';

	getSQLType(): string {
		return 'cidr';
	}
}

export function cidr<TName extends string>(name: TName): PgCidrBuilderInitial<TName> {
	return new PgCidrBuilder(name);
}
