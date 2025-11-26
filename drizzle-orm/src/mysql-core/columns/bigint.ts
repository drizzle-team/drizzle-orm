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

	override mapToDriverValue(value: bigint): string {
		return value.toString();
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: bigint | string): bigint {
		if (typeof value === 'bigint') return value;

		return BigInt(value);
	}
}

export class MySqlBigIntStringBuilder<TUnsigned extends boolean | undefined>
	extends MySqlColumnBuilderWithAutoIncrement<{
		dataType: Equal<TUnsigned, true> extends true ? 'string uint64' : 'string int64';
		data: string;
		driverParam: number | string;
	}, { unsigned?: boolean }>
{
	static override readonly [entityKind]: string = 'MySqlBigIntStringBuilder';

	constructor(name: string, unsigned: boolean = false) {
		super(name, unsigned ? 'string uint64' : 'string int64' as any, 'MySqlBigIntString');
		this.config.unsigned = unsigned as TUnsigned;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlBigIntString(
			table,
			this.config as any,
		);
	}
}

export class MySqlBigIntString<T extends ColumnBaseConfig<'string int64' | 'string uint64'>>
	extends MySqlColumnWithAutoIncrement<T, { unsigned: boolean }>
{
	static override readonly [entityKind]: string = 'MySqlBigIntString';

	getSQLType(): string {
		return `bigint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): string {
		if (typeof value === 'string') {
			return value;
		}
		return String(value);
	}
}

export interface MySqlBigIntConfig<
	T extends 'number' | 'bigint' | 'string' = 'number' | 'bigint' | 'string',
	TUnsigned extends boolean | undefined = boolean | undefined,
> {
	mode: T;
	unsigned?: TUnsigned;
}

export function bigint<TMode extends MySqlBigIntConfig['mode'], TUnsigned extends boolean | undefined>(
	config: MySqlBigIntConfig<TMode, TUnsigned>,
): TMode extends 'bigint' ? MySqlBigInt64Builder<TUnsigned>
	: TMode extends 'string' ? MySqlBigIntStringBuilder<TUnsigned>
	: MySqlBigInt53Builder<TUnsigned>;
export function bigint<TMode extends MySqlBigIntConfig['mode'], TUnsigned extends boolean | undefined>(
	name: string,
	config: MySqlBigIntConfig<TMode, TUnsigned>,
): TMode extends 'bigint' ? MySqlBigInt64Builder<TUnsigned>
	: TMode extends 'string' ? MySqlBigIntStringBuilder<TUnsigned>
	: MySqlBigInt53Builder<TUnsigned>;
export function bigint(a: string | MySqlBigIntConfig, b?: MySqlBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new MySqlBigInt53Builder(name, config.unsigned);
	}
	if (config.mode === 'string') {
		return new MySqlBigIntStringBuilder(name, config.unsigned);
	}
	return new MySqlBigInt64Builder(name, config.unsigned);
}
