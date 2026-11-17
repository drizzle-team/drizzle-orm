import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, type CockroachColumnBaseConfig } from './common.ts';
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

export class CockroachBigInt53<T extends CockroachColumnBaseConfig<'number int53'>>
	extends CockroachColumn<'number int53', T>
{
	static override readonly [entityKind]: string = 'CockroachBigInt53';

	/** @internal */
	override readonly codec = 'int8:number';

	getSQLType(): string {
		return 'int8';
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

export class CockroachBigInt64<T extends CockroachColumnBaseConfig<'bigint int64'>>
	extends CockroachColumn<'bigint int64', T>
{
	static override readonly [entityKind]: string = 'CockroachBigInt64';

	/** @internal */
	override readonly codec = 'int8';

	getSQLType(): string {
		return 'int8';
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
