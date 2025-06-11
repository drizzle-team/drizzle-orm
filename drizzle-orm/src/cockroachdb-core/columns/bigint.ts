import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachDbColumn } from './common.ts';
import { CockroachDbIntColumnBaseBuilder } from './int.common.ts';

export type CockroachDbBigInt53BuilderInitial<TName extends string> = CockroachDbBigInt53Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachDbBigInt53';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class CockroachDbBigInt53Builder<T extends ColumnBuilderBaseConfig<'number', 'CockroachDbBigInt53'>>
	extends CockroachDbIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbBigInt53Builder';

	constructor(name: T['name']) {
		super(name, 'number', 'CockroachDbBigInt53');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbBigInt53<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbBigInt53<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbBigInt53<T extends ColumnBaseConfig<'number', 'CockroachDbBigInt53'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbBigInt53';

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

export type CockroachDbBigInt64BuilderInitial<TName extends string> = CockroachDbBigInt64Builder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'CockroachDbBigInt64';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbBigInt64Builder<T extends ColumnBuilderBaseConfig<'bigint', 'CockroachDbBigInt64'>>
	extends CockroachDbIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbBigInt64Builder';

	constructor(name: T['name']) {
		super(name, 'bigint', 'CockroachDbBigInt64');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbBigInt64<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbBigInt64<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbBigInt64<T extends ColumnBaseConfig<'bigint', 'CockroachDbBigInt64'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbBigInt64';

	getSQLType(): string {
		return 'int8';
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export interface CockroachDbBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
}

export function bigint<TMode extends CockroachDbBigIntConfig['mode']>(
	config: CockroachDbBigIntConfig<TMode>,
): TMode extends 'number' ? CockroachDbBigInt53BuilderInitial<''> : CockroachDbBigInt64BuilderInitial<''>;
export function bigint<TName extends string, TMode extends CockroachDbBigIntConfig['mode']>(
	name: TName,
	config: CockroachDbBigIntConfig<TMode>,
): TMode extends 'number' ? CockroachDbBigInt53BuilderInitial<TName> : CockroachDbBigInt64BuilderInitial<TName>;
export function bigint(a: string | CockroachDbBigIntConfig, b?: CockroachDbBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachDbBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new CockroachDbBigInt53Builder(name);
	}
	return new CockroachDbBigInt64Builder(name);
}
export function int8<TMode extends CockroachDbBigIntConfig['mode']>(
	config: CockroachDbBigIntConfig<TMode>,
): TMode extends 'number' ? CockroachDbBigInt53BuilderInitial<''> : CockroachDbBigInt64BuilderInitial<''>;
export function int8<TName extends string, TMode extends CockroachDbBigIntConfig['mode']>(
	name: TName,
	config: CockroachDbBigIntConfig<TMode>,
): TMode extends 'number' ? CockroachDbBigInt53BuilderInitial<TName> : CockroachDbBigInt64BuilderInitial<TName>;
export function int8(a: string | CockroachDbBigIntConfig, b?: CockroachDbBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachDbBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new CockroachDbBigInt53Builder(name);
	}
	return new CockroachDbBigInt64Builder(name);
}
