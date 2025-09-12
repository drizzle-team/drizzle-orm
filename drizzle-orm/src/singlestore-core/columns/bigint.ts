import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export class SingleStoreBigInt53Builder<TUnsigned extends boolean | undefined>
	extends SingleStoreColumnBuilderWithAutoIncrement<{
		name: string;
		dataType: Equal<TUnsigned, true> extends true ? 'number uint53' : 'number int53';
		data: number;
		driverParam: number | string;
	}, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'SingleStoreBigInt53Builder';

	constructor(name: string, unsigned: boolean = false) {
		super(name, unsigned ? 'number uint53' : 'number int53' as any, 'SingleStoreBigInt53');
		this.config.unsigned = unsigned;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreBigInt53(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreBigInt53<T extends ColumnBaseConfig<'number int53' | 'number uint53'>>
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

export class SingleStoreBigInt64Builder<TUnsigned extends boolean | undefined>
	extends SingleStoreColumnBuilderWithAutoIncrement<{
		name: string;
		dataType: Equal<TUnsigned, true> extends true ? 'bigint uint64' : 'bigint int64';
		data: bigint;
		driverParam: string;
	}, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'SingleStoreBigInt64Builder';

	constructor(name: string, unsigned: boolean = false) {
		super(name, unsigned ? 'bigint uint64' : 'bigint int64' as any, 'SingleStoreBigInt64');
		this.config.unsigned = unsigned;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreBigInt64(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreBigInt64<T extends ColumnBaseConfig<'bigint int64' | 'bigint uint64'>>
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

export interface SingleStoreBigIntConfig<
	T extends 'number' | 'bigint' = 'number' | 'bigint',
	TUnsigned extends boolean | undefined = boolean | undefined,
> {
	mode: T;
	unsigned?: TUnsigned;
}

export function bigint<TMode extends SingleStoreBigIntConfig['mode'], TUnsigned extends boolean | undefined>(
	config: SingleStoreBigIntConfig<TMode, TUnsigned>,
): TMode extends 'number' ? SingleStoreBigInt53Builder<TUnsigned> : SingleStoreBigInt64Builder<TUnsigned>;
export function bigint<TMode extends SingleStoreBigIntConfig['mode'], TUnsigned extends boolean | undefined>(
	name: string,
	config: SingleStoreBigIntConfig<TMode, TUnsigned>,
): TMode extends 'number' ? SingleStoreBigInt53Builder<TUnsigned> : SingleStoreBigInt64Builder<TUnsigned>;
export function bigint(a?: string | SingleStoreBigIntConfig, b?: SingleStoreBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new SingleStoreBigInt53Builder(name, config.unsigned);
	}
	return new SingleStoreBigInt64Builder(name, config.unsigned);
}
