import { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export class PgBigSerial53Builder extends PgColumnBuilder<{
	data: number;
	driverParam: number;
	notNull: true;
	hasDefault: true;
}> {
	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgBigSerial53<TTableName> {
		return new PgBigSerial53(table, this);
	}
}

export class PgBigSerial53<TTableName extends string> extends PgColumn<{
	tableName: TTableName;
	data: number;
	driverParam: number;
	notNull: true;
	hasDefault: true;
}> {
	protected override $pgColumnBrand!: 'PgBigSerial53';

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

export class PgBigSerial64Builder extends PgColumnBuilder<{
	data: bigint;
	driverParam: string;
	notNull: true;
	hasDefault: true;
}> {
	/** @internal */
	override build<TTableName extends string>(table: AnyPgTable<{ name: TTableName }>): PgBigSerial64<TTableName> {
		return new PgBigSerial64(table, this);
	}
}

export class PgBigSerial64<
	TTableName extends string,
> extends PgColumn<{
	tableName: TTableName;
	data: bigint;
	driverParam: string;
	notNull: true;
	hasDefault: true;
}> {
	protected override $pgColumnBrand!: 'PgBigSerial64';

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
