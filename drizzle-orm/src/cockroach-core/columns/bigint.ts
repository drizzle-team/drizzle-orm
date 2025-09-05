import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn } from './common.ts';
import { CockroachIntColumnBaseBuilder } from './int.common.ts';

export class CockroachBigInt53Builder extends CockroachIntColumnBaseBuilder<{
	dataType: 'number int53';
	data: number;
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'CockroachBigInt53Builder';

	constructor(name: string) {
		super(name, 'number int53', 'CockroachBigInt53');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachBigInt53(
			table,
			this.config,
		);
	}
}

export class CockroachBigInt53<T extends ColumnBaseConfig<'number int53'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachBigInt53';

	getSQLType(): string {
		return 'int8';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'number') {
			return value;
		}
		return Number(value);
	}
}

export class CockroachBigInt64Builder extends CockroachIntColumnBaseBuilder<{
	dataType: 'bigint int64';
	data: bigint;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'CockroachBigInt64Builder';

	constructor(name: string) {
		super(name, 'bigint int64', 'CockroachBigInt64');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachBigInt64(
			table,
			this.config,
		);
	}
}

export class CockroachBigInt64<T extends ColumnBaseConfig<'bigint int64'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachBigInt64';

	getSQLType(): string {
		return 'int8';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export interface CockroachBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigint<TMode extends CockroachBigIntConfig['mode']>(
	config: CockroachBigIntConfig<TMode>,
): TMode extends 'number' ? CockroachBigInt53Builder : CockroachBigInt64Builder;
export function bigint<TMode extends CockroachBigIntConfig['mode']>(
	name: string,
	config: CockroachBigIntConfig<TMode>,
): TMode extends 'number' ? CockroachBigInt53Builder : CockroachBigInt64Builder;
export function bigint(a: string | CockroachBigIntConfig, b?: CockroachBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new CockroachBigInt53Builder(name);
	}
	return new CockroachBigInt64Builder(name);
}
export function int8<TMode extends CockroachBigIntConfig['mode']>(
	config: CockroachBigIntConfig<TMode>,
): TMode extends 'number' ? CockroachBigInt53Builder : CockroachBigInt64Builder;
export function int8<TMode extends CockroachBigIntConfig['mode']>(
	name: string,
	config: CockroachBigIntConfig<TMode>,
): TMode extends 'number' ? CockroachBigInt53Builder : CockroachBigInt64Builder;
export function int8(a: string | CockroachBigIntConfig, b?: CockroachBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new CockroachBigInt53Builder(name);
	}
	return new CockroachBigInt64Builder(name);
}
