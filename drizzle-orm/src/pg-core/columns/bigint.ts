import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';
import type { Assume } from '~/utils';

import { PgColumn, PgColumnBuilder } from './common';

export interface PgBigInt53BuilderHKT extends ColumnBuilderHKTBase {
	_type: PgBigInt53Builder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgBigInt53HKT;
}

export interface PgBigInt53HKT extends ColumnHKTBase {
	_type: PgBigInt53<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgBigInt53BuilderInitial<TName extends string> = PgBigInt53Builder<{
	name: TName;
	data: number;
	driverParam: number | string;
	notNull: false;
	hasDefault: false;
}>;

export class PgBigInt53Builder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgBigInt53BuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgBigInt53<MakeColumnConfig<T, TTableName>> {
		return new PgBigInt53<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgBigInt53<T extends ColumnBaseConfig> extends PgColumn<PgBigInt53HKT, T> {
	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'number') {
			return value;
		}
		return parseInt(value);
	}
}

export interface PgBigInt64BuilderHKT extends ColumnBuilderHKTBase {
	_type: PgBigInt64Builder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgBigInt64HKT;
}

export interface PgBigInt64HKT extends ColumnHKTBase {
	_type: PgBigInt64<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgBigInt64BuilderInitial<TName extends string> = PgBigInt64Builder<{
	name: TName;
	data: bigint;
	driverParam: string;
	notNull: false;
	hasDefault: false;
}>;

export class PgBigInt64Builder<T extends ColumnBuilderBaseConfig> extends PgColumnBuilder<PgBigInt64BuilderHKT, T> {
	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgBigInt64<Pick<T, keyof ColumnBuilderBaseConfig> & { tableName: TTableName }> {
		return new PgBigInt64<Pick<T, keyof ColumnBuilderBaseConfig> & { tableName: TTableName }>(table, this.config);
	}
}

export class PgBigInt64<T extends ColumnBaseConfig> extends PgColumn<PgBigInt64HKT, T> {
	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

interface PgBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigint<TName extends string, TMode extends PgBigIntConfig['mode']>(
	name: TName,
	config: PgBigIntConfig<TMode>,
): TMode extends 'number' ? PgBigInt53BuilderInitial<TName> : PgBigInt64BuilderInitial<TName>;
export function bigint(name: string, config: PgBigIntConfig) {
	if (config.mode === 'number') {
		return new PgBigInt53Builder(name);
	}
	return new PgBigInt64Builder(name);
}
