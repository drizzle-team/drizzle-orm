import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export class SingleStoreBigInt53Builder extends SingleStoreColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, { unsigned: boolean }> {
	static override readonly [entityKind]: string = 'SingleStoreBigInt53Builder';

	constructor(name: string, unsigned: boolean = false) {
		super(name, 'number', 'SingleStoreBigInt53');
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

export class SingleStoreBigInt53<T extends ColumnBaseConfig<'number'>>
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

export class SingleStoreBigInt64Builder extends SingleStoreColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'bigint';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}, { unsigned: boolean }> {
	static override readonly [entityKind]: string = 'SingleStoreBigInt64Builder';

	constructor(name: string, unsigned: boolean = false) {
		super(name, 'bigint', 'SingleStoreBigInt64');
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

export class SingleStoreBigInt64<T extends ColumnBaseConfig<'bigint'>>
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
): TMode extends 'number' ? SingleStoreBigInt53Builder : SingleStoreBigInt64Builder;
export function bigint<TMode extends SingleStoreBigIntConfig['mode']>(
	name: string,
	config: SingleStoreBigIntConfig<TMode>,
): TMode extends 'number' ? SingleStoreBigInt53Builder : SingleStoreBigInt64Builder;
export function bigint(a?: string | SingleStoreBigIntConfig, b?: SingleStoreBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new SingleStoreBigInt53Builder(name, config.unsigned);
	}
	return new SingleStoreBigInt64Builder(name, config.unsigned);
}
