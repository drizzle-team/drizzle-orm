import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import type { PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgBigSerial53Builder extends PgColumnBuilder<{
	name: string;
	dataType: 'number integer';
	data: number;
	driverParam: number;
	enumValues: undefined;
	notNull: true;
	hasDefault: true;
}> {
	static override readonly [entityKind]: string = 'PgBigSerial53Builder';

	constructor(name: string) {
		super(name, 'number integer', 'PgBigSerial53');
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgBigSerial53(
			table,
			this.config as any,
		);
	}
}

export class PgBigSerial53 extends PgColumn<ColumnBaseConfig<'number integer'>> {
	static override readonly [entityKind]: string = 'PgBigSerial53';

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

export class PgBigSerial64Builder extends PgColumnBuilder<{
	name: string;
	dataType: 'bigint';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
	notNull: true;
	hasDefault: true;
}> {
	static override readonly [entityKind]: string = 'PgBigSerial64Builder';

	constructor(name: string) {
		super(name, 'bigint', 'PgBigSerial64');
		this.config.hasDefault = true;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgBigSerial64(
			table,
			this.config as any,
		);
	}
}

export class PgBigSerial64<T extends ColumnBaseConfig<'bigint'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgBigSerial64';

	getSQLType(): string {
		return 'bigserial';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export interface PgBigSerialConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigserial<TMode extends PgBigSerialConfig['mode']>(
	config: PgBigSerialConfig<TMode>,
): TMode extends 'number' ? PgBigSerial53Builder : PgBigSerial64Builder;
export function bigserial<TMode extends PgBigSerialConfig['mode']>(
	name: string,
	config: PgBigSerialConfig<TMode>,
): TMode extends 'number' ? PgBigSerial53Builder : PgBigSerial64Builder;
export function bigserial(a: string | PgBigSerialConfig, b?: PgBigSerialConfig) {
	const { name, config } = getColumnNameAndConfig<PgBigSerialConfig>(a, b);
	if (config.mode === 'number') {
		return new PgBigSerial53Builder(name);
	}
	return new PgBigSerial64Builder(name);
}
