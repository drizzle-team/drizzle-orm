import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn } from './common.ts';
import { PgIntColumnBaseBuilder } from './int.common.ts';

export class PgBigInt53Builder extends PgIntColumnBaseBuilder<{
	dataType: 'number int53';
	data: number;
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'PgBigInt53Builder';

	constructor(name: string) {
		super(name, 'number int53', 'PgBigInt53');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgBigInt53(table, this.config as any);
	}
}

export class PgBigInt53<T extends ColumnBaseConfig<'number int53'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgBigInt53';

	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'number') {
			return value;
		}
		return Number(value);
	}
}

export class PgBigInt64Builder extends PgIntColumnBaseBuilder<{
	dataType: 'bigint int64';
	data: bigint;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgBigInt64Builder';

	constructor(name: string) {
		super(name, 'bigint int64', 'PgBigInt64');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgBigInt64(table, this.config as any);
	}
}

export class PgBigInt64<T extends ColumnBaseConfig<'bigint int64'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgBigInt64';

	getSQLType(): string {
		return 'bigint';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export interface PgBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigint<TMode extends PgBigIntConfig['mode']>(
	config: PgBigIntConfig<TMode>,
): TMode extends 'number' ? PgBigInt53Builder : PgBigInt64Builder;
export function bigint<TMode extends PgBigIntConfig['mode']>(
	name: string,
	config: PgBigIntConfig<TMode>,
): TMode extends 'number' ? PgBigInt53Builder : PgBigInt64Builder;
export function bigint(a: string | PgBigIntConfig, b?: PgBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<PgBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new PgBigInt53Builder(name);
	}
	return new PgBigInt64Builder(name);
}
