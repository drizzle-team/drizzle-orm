import { ColumnData, ColumnDriverParam, ColumnHasDefault, ColumnNotNull, TableName } from 'drizzle-orm/branded-types';
import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgBigSerial53Builder extends PgColumnBuilder<
	ColumnData<number>,
	ColumnDriverParam<number>,
	ColumnNotNull<true>,
	ColumnHasDefault<true>
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgBigSerial53<TTableName> {
		return new PgBigSerial53<TTableName>(table, this);
	}
}

export class PgBigSerial53<TTableName extends TableName> extends PgColumn<
	TTableName,
	ColumnData<number>,
	ColumnDriverParam<number>,
	ColumnNotNull<true>,
	ColumnHasDefault<true>
> {
	protected brand!: 'PgBigSerial53';

	getSQLType(): string {
		return 'bigserial';
	}

	override mapFromDriverValue(value: number): number {
		if (typeof value === 'number') {
			return value;
		}
		return parseInt(value);
	}
}

export class PgBigSerial64Builder extends PgColumnBuilder<
	ColumnData<bigint>,
	ColumnDriverParam<string>,
	ColumnNotNull<true>,
	ColumnHasDefault<true>
> {
	/** @internal */
	override build<TTableName extends TableName>(
		table: AnyPgTable<TTableName>,
	): PgBigSerial64<TTableName> {
		return new PgBigSerial64<TTableName>(table, this);
	}
}

export class PgBigSerial64<
	TTableName extends TableName,
> extends PgColumn<
	TTableName,
	ColumnData<bigint>,
	ColumnDriverParam<string>,
	ColumnNotNull<true>,
	ColumnHasDefault<true>
> {
	protected brand!: 'PgBigSerial64';

	getSQLType(): string {
		return 'bigserial';
	}

	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

interface PgBigSerialConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigserial(name: string, config: PgBigSerialConfig<'number'>): PgBigSerial53Builder;
export function bigserial(name: string, config: PgBigSerialConfig<'bigint'>): PgBigSerial64Builder;
export function bigserial(name: string, { mode }: PgBigSerialConfig) {
	if (mode === 'number') {
		return new PgBigSerial53Builder(name);
	}
	return new PgBigSerial64Builder(name);
}
