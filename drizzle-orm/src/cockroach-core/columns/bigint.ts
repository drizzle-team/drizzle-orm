import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn } from './common.ts';
import { CockroachIntColumnBaseBuilder } from './int.common.ts';

export type CockroachBigInt53BuilderInitial<TName extends string> = CockroachBigInt53Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachBigInt53';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class CockroachBigInt53Builder<T extends ColumnBuilderBaseConfig<'number', 'CockroachBigInt53'>>
	extends CockroachIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachBigInt53Builder';

	constructor(name: T['name']) {
		super(name, 'number', 'CockroachBigInt53');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachBigInt53<MakeColumnConfig<T, TTableName>> {
		return new CockroachBigInt53<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachBigInt53<T extends ColumnBaseConfig<'number', 'CockroachBigInt53'>> extends CockroachColumn<T> {
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

export type CockroachBigInt64BuilderInitial<TName extends string> = CockroachBigInt64Builder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'CockroachBigInt64';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachBigInt64Builder<T extends ColumnBuilderBaseConfig<'bigint', 'CockroachBigInt64'>>
	extends CockroachIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachBigInt64Builder';

	constructor(name: T['name']) {
		super(name, 'bigint', 'CockroachBigInt64');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachBigInt64<MakeColumnConfig<T, TTableName>> {
		return new CockroachBigInt64<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachBigInt64<T extends ColumnBaseConfig<'bigint', 'CockroachBigInt64'>> extends CockroachColumn<T> {
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
): TMode extends 'number' ? CockroachBigInt53BuilderInitial<''> : CockroachBigInt64BuilderInitial<''>;
export function bigint<TName extends string, TMode extends CockroachBigIntConfig['mode']>(
	name: TName,
	config: CockroachBigIntConfig<TMode>,
): TMode extends 'number' ? CockroachBigInt53BuilderInitial<TName> : CockroachBigInt64BuilderInitial<TName>;
export function bigint(a: string | CockroachBigIntConfig, b?: CockroachBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new CockroachBigInt53Builder(name);
	}
	return new CockroachBigInt64Builder(name);
}
export function int8<TMode extends CockroachBigIntConfig['mode']>(
	config: CockroachBigIntConfig<TMode>,
): TMode extends 'number' ? CockroachBigInt53BuilderInitial<''> : CockroachBigInt64BuilderInitial<''>;
export function int8<TName extends string, TMode extends CockroachBigIntConfig['mode']>(
	name: TName,
	config: CockroachBigIntConfig<TMode>,
): TMode extends 'number' ? CockroachBigInt53BuilderInitial<TName> : CockroachBigInt64BuilderInitial<TName>;
export function int8(a: string | CockroachBigIntConfig, b?: CockroachBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new CockroachBigInt53Builder(name);
	}
	return new CockroachBigInt64Builder(name);
}
