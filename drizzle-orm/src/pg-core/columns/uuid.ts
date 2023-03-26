import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';

import type { AnyPgTable } from '~/pg-core/table';
import { sql } from '~/sql';
import type { Assume } from '~/utils';

import { PgColumn, PgColumnBuilder } from './common';

export interface PgUUIDBuilderHKT extends ColumnBuilderHKTBase {
	_type: PgUUIDBuilder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgUUIDHKT;
}

export interface PgUUIDHKT extends ColumnHKTBase {
	_type: PgUUID<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgUUIDBuilderInitial<TName extends string> = PgUUIDBuilder<{
	name: TName;
	data: string;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgUUIDBuilder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgUUIDBuilderHKT, T> {
	/**
	 * Adds `default gen_random_uuid()` to the column definition.
	 */
	defaultRandom(): ReturnType<this['default']> {
		return this.default(sql`gen_random_uuid()`) as ReturnType<this['default']>;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgUUID<MakeColumnConfig<T, TTableName>> {
		return new PgUUID<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgUUID<T extends ColumnBaseConfig> extends PgColumn<PgUUIDHKT, T> {
	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid<TName extends string>(name: TName): PgUUIDBuilderInitial<TName> {
	return new PgUUIDBuilder(name);
}
