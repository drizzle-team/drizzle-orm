import type { ColumnConfig } from '~/column';
import type { ColumnBuilderConfig } from '~/column-builder';
import type { AnyPgTable } from '~/pg-core/table';

import { PgColumn, PgColumnBuilder } from './common';

export class PgBigInt53Builder extends PgColumnBuilder<
	ColumnBuilderConfig<{
		data: number;
		driverParam: number | string;
	}>
> {
	protected override $pgColumnBuilderBrand!: 'PgBigInt53Builder';

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgBigInt53<TTableName> {
		return new PgBigInt53(table, this.config);
	}
}

export class PgBigInt53<TTableName extends string> extends PgColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: number;
		driverParam: number | string;
	}>
> {
	declare protected $pgColumnBrand: 'PgBigInt53';

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

export class PgBigInt64Builder extends PgColumnBuilder<ColumnBuilderConfig<{ data: bigint; driverParam: string }>> {
	protected override $pgColumnBuilderBrand!: 'PgBigInt64Builder';

	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgBigInt64<TTableName> {
		return new PgBigInt64(table, this.config);
	}
}

export class PgBigInt64<TTableName extends string> extends PgColumn<
	ColumnConfig<{
		tableName: TTableName;
		data: bigint;
		driverParam: string;
	}>
> {
	protected override $pgColumnBrand!: 'PgBigInt64';

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

export function bigint(name: string, config: PgBigIntConfig<'number'>): PgBigInt53Builder;
export function bigint(name: string, config: PgBigIntConfig<'bigint'>): PgBigInt64Builder;
export function bigint(name: string, config: PgBigIntConfig) {
	if (config.mode === 'number') {
		return new PgBigInt53Builder(name);
	}
	return new PgBigInt64Builder(name);
}
