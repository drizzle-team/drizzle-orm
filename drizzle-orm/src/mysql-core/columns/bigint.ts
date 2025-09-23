import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlBigInt53Builder<TUnsigned extends boolean | undefined> extends MySqlColumnBuilderWithAutoIncrement<{
	dataType: Equal<TUnsigned, true> extends true ? 'number uint53' : 'number int53';
	data: number;
	driverParam: number | string;
}, { unsigned?: boolean }> {
	static override readonly [entityKind]: string = 'MySqlBigInt53Builder';

	constructor(name: string, unsigned: boolean = false) {
		super(name, (unsigned ? 'number uint53' : 'number int53') as any, 'MySqlBigInt53');
		this.config.unsigned = unsigned as TUnsigned;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlBigInt53(
			table,
			this.config as any,
		);
	}
}

export class MySqlBigInt53<T extends ColumnBaseConfig<'number int53' | 'number uint53'>>
	extends MySqlColumnWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'MySqlBigInt53';

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

export class MySqlBigInt64Builder<TUnsigned extends boolean | undefined> extends MySqlColumnBuilderWithAutoIncrement<{
	dataType: Equal<TUnsigned, true> extends true ? 'bigint uint64' : 'bigint int64';
	data: bigint;
	driverParam: string;
}, { unsigned?: boolean }> {
	static override readonly [entityKind]: string = 'MySqlBigInt64Builder';

	constructor(name: string, unsigned: boolean = false) {
		super(name, (unsigned ? 'bigint uint64' : 'bigint int64') as any, 'MySqlBigInt64');
		this.config.unsigned = unsigned;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlBigInt64(
			table,
			this.config as any,
		);
	}
}

export class MySqlBigInt64<T extends ColumnBaseConfig<'bigint int64' | 'bigint uint64'>>
	extends MySqlColumnWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'MySqlBigInt64';

	getSQLType(): string {
		return `bigint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): bigint {
		return BigInt(value);
	}
}

export interface MySqlBigIntConfig<
	T extends 'number' | 'bigint' = 'number' | 'bigint',
	TUnsigned extends boolean | undefined = boolean | undefined,
> {
	mode: T;
	unsigned?: TUnsigned;
}

export function bigint<TMode extends MySqlBigIntConfig['mode'], TUnsigned extends boolean | undefined>(
	config: MySqlBigIntConfig<TMode, TUnsigned>,
): TMode extends 'number' ? MySqlBigInt53Builder<TUnsigned> : MySqlBigInt64Builder<TUnsigned>;
export function bigint<TMode extends MySqlBigIntConfig['mode'], TUnsigned extends boolean | undefined>(
	name: string,
	config: MySqlBigIntConfig<TMode, TUnsigned>,
): TMode extends 'number' ? MySqlBigInt53Builder<TUnsigned> : MySqlBigInt64Builder<TUnsigned>;
export function bigint(a?: string | MySqlBigIntConfig, b?: MySqlBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new MySqlBigInt53Builder(name, config.unsigned);
	}
	return new MySqlBigInt64Builder(name, config.unsigned);
}
