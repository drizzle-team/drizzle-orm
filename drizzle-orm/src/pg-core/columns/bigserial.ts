import type { ColumnBaseConfig, ColumnHKTBase } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderHKTBase, MakeColumnConfig } from '~/column-builder';
import type { Assume } from '~/utils';
import type { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export interface PgBigSerial53BuilderHKT extends ColumnBuilderHKTBase {
	_type: PgBigSerial53Builder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgBigSerial53HKT;
}

export interface PgBigSerial53HKT extends ColumnHKTBase {
	_type: PgBigSerial53<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgBigSerial53BuilderInitial<TName extends string> = PgBigSerial53Builder<{
	name: TName;
	data: number;
	driverParam: number;
	notNull: true;
	hasDefault: true;
}>;

export class PgBigSerial53Builder<T extends ColumnBuilderBaseConfig>
	extends PgColumnBuilder<PgBigSerial53BuilderHKT, T>
{
	constructor(name: string) {
		super(name);
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgBigSerial53<MakeColumnConfig<T, TTableName>> {
		return new PgBigSerial53<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgBigSerial53<T extends ColumnBaseConfig> extends PgColumn<PgBigSerial53HKT, T> {
	getSQLType(): string {
		return 'bigserial';
	}

	override mapFromDriverValue(value: number): number {
		if (typeof value === 'number') {
			return value;
		}
		return Number(value);
	}
}

export interface PgBigSerial64BuilderHKT extends ColumnBuilderHKTBase {
	_type: PgBigSerial64Builder<Assume<this['config'], ColumnBuilderBaseConfig>>;
	_columnHKT: PgBigSerial64HKT;
}

export interface PgBigSerial64HKT extends ColumnHKTBase {
	_type: PgBigSerial64<Assume<this['config'], ColumnBaseConfig>>;
}

export type PgBigSerial64BuilderInitial<TName extends string> = PgBigSerial64Builder<{
	name: TName;
	data: bigint;
	driverParam: string;
	notNull: true;
	hasDefault: true;
}>;

export class PgBigSerial64Builder<T extends ColumnBuilderBaseConfig>
	extends PgColumnBuilder<PgBigSerial64BuilderHKT, T>
{
	constructor(name: string) {
		super(name);
		this.config.hasDefault = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgBigSerial64<MakeColumnConfig<T, TTableName>> {
		return new PgBigSerial64<MakeColumnConfig<T, TTableName>>(table, this.config);
	}
}

export class PgBigSerial64<T extends ColumnBaseConfig> extends PgColumn<PgBigSerial64HKT, T> {
	getSQLType(): string {
		return 'bigserial';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

interface PgBigSerialConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigserial<TName extends string, TMode extends PgBigSerialConfig['mode']>(
	name: TName,
	config: PgBigSerialConfig<TMode>,
): TMode extends 'number' ? PgBigSerial53BuilderInitial<TName> : PgBigSerial64BuilderInitial<TName>;
export function bigserial(name: string, { mode }: PgBigSerialConfig) {
	if (mode === 'number') {
		return new PgBigSerial53Builder(name);
	}
	return new PgBigSerial64Builder(name);
}
