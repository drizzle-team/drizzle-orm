import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export type SingleStoreBigInt53BuilderInitial<TName extends string> = SingleStoreBigInt53Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreBigInt53';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class SingleStoreBigInt53Builder<T extends ColumnBuilderBaseConfig<'number', 'SingleStoreBigInt53'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'SingleStoreBigInt53Builder';

	constructor(name: T['name'], unsigned: boolean = false) {
		super(name, 'number', 'SingleStoreBigInt53');
		this.config.unsigned = unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBigInt53<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBigInt53<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreBigInt53<T extends ColumnBaseConfig<'number', 'SingleStoreBigInt53'>>
	extends SingleStoreColumnWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'SingleStoreBigInt53';

	getSQLType(): string {
		return `bigint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'number') {
			return value;
		}
		return Number(value);
	}
}

export type SingleStoreBigInt64BuilderInitial<TName extends string> = SingleStoreBigInt64Builder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'SingleStoreBigInt64';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreBigInt64Builder<T extends ColumnBuilderBaseConfig<'bigint', 'SingleStoreBigInt64'>>
	extends SingleStoreColumnBuilderWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'SingleStoreBigInt64Builder';

	constructor(name: T['name'], unsigned: boolean = false) {
		super(name, 'bigint', 'SingleStoreBigInt64');
		this.config.unsigned = unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBigInt64<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBigInt64<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreBigInt64<T extends ColumnBaseConfig<'bigint', 'SingleStoreBigInt64'>>
	extends SingleStoreColumnWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'SingleStoreBigInt64';

	getSQLType(): string {
		return `bigint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export interface SingleStoreBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
	unsigned?: boolean;
}

export function bigint<TMode extends SingleStoreBigIntConfig['mode']>(
	config: SingleStoreBigIntConfig<TMode>,
): TMode extends 'number' ? SingleStoreBigInt53BuilderInitial<''> : SingleStoreBigInt64BuilderInitial<''>;
export function bigint<TName extends string, TMode extends SingleStoreBigIntConfig['mode']>(
	name: TName,
	config: SingleStoreBigIntConfig<TMode>,
): TMode extends 'number' ? SingleStoreBigInt53BuilderInitial<TName> : SingleStoreBigInt64BuilderInitial<TName>;
export function bigint(a?: string | SingleStoreBigIntConfig, b?: SingleStoreBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new SingleStoreBigInt53Builder(name, config.unsigned);
	}
	return new SingleStoreBigInt64Builder(name, config.unsigned);
}
