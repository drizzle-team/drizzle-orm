import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlBigInt53Builder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}, { unsigned: boolean }> {
	static override readonly [entityKind]: string = 'MySqlBigInt53Builder';

	constructor(name: string, unsigned: boolean = false) {
		super(name, 'number', 'MySqlBigInt53');
		this.config.unsigned = unsigned;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlBigInt53(
			table,
			this.config as any,
		);
	}
}

export class MySqlBigInt53<T extends ColumnBaseConfig<'number'>>
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

export class MySqlBigInt64Builder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'bigint';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}, { unsigned: boolean }> {
	static override readonly [entityKind]: string = 'MySqlBigInt64Builder';

	constructor(name: string, unsigned: boolean = false) {
		super(name, 'bigint', 'MySqlBigInt64');
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

export class MySqlBigInt64<T extends ColumnBaseConfig<'bigint'>>
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

export interface MySqlBigIntConfig<T extends 'number' | 'bigint' = 'number' | 'bigint'> {
	mode: T;
	unsigned?: boolean;
}

export function bigint<TMode extends MySqlBigIntConfig['mode']>(
	config: MySqlBigIntConfig<TMode>,
): TMode extends 'number' ? MySqlBigInt53Builder : MySqlBigInt64Builder;
export function bigint<TMode extends MySqlBigIntConfig['mode']>(
	name: string,
	config: MySqlBigIntConfig<TMode>,
): TMode extends 'number' ? MySqlBigInt53Builder : MySqlBigInt64Builder;
export function bigint(a?: string | MySqlBigIntConfig, b?: MySqlBigIntConfig) {
	const { name, config } = getColumnNameAndConfig<MySqlBigIntConfig>(a, b);
	if (config.mode === 'number') {
		return new MySqlBigInt53Builder(name, config.unsigned);
	}
	return new MySqlBigInt64Builder(name, config.unsigned);
}
