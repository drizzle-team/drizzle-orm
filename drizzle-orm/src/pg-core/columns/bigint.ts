import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn } from './common.ts';
import { PgIntColumnBuilder } from './int.common.ts';

export class PgBigInt53Builder extends PgIntColumnBuilder<{
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

export class PgBigInt53 extends PgColumn<'number int53'> {
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

export class PgBigInt64Builder extends PgIntColumnBuilder<{
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

export class PgBigInt64 extends PgColumn<'bigint int64'> {
	static override readonly [entityKind]: string = 'PgBigInt64';

	getSQLType(): string {
		return 'bigint';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export class PgBigIntStringBuilder extends PgIntColumnBuilder<{
	dataType: 'string int64';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgBigIntStringBuilder';

	constructor(name: string) {
		super(name, 'string int64', 'PgBigIntString');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgBigIntString(table, this.config as any);
	}
}

export class PgBigIntString extends PgColumn<'string int64'> {
	static override readonly [entityKind]: string = 'PgBigIntString';

	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: string | number): string {
		if (typeof value === 'string') return value;

		return String(value);
	}
}

export interface PgBigIntConfig<T extends 'number' | 'bigint' | 'string' = 'number' | 'bigint' | 'string'> {
	mode: T;
}

export function bigint<TMode extends PgBigIntConfig['mode']>(
	config: PgBigIntConfig<TMode>,
): TMode extends 'string' ? PgBigIntStringBuilder : TMode extends 'bigint' ? PgBigInt64Builder : PgBigInt53Builder;
export function bigint<TMode extends PgBigIntConfig['mode']>(
	name: string,
	config: PgBigIntConfig<TMode>,
): TMode extends 'string' ? PgBigIntStringBuilder : TMode extends 'bigint' ? PgBigInt64Builder : PgBigInt53Builder;
export function bigint(a: string | PgBigIntConfig, b?: PgBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<PgBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new PgBigInt53Builder(name);
	}
	if (config.mode === 'string') {
		return new PgBigIntStringBuilder(name);
	}
	return new PgBigInt64Builder(name);
}
