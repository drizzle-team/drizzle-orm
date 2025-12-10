import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlDecimalBuilder<TUnsigned extends boolean | undefined> extends MySqlColumnBuilderWithAutoIncrement<{
	dataType: Equal<TUnsigned, true> extends true ? 'string unumeric' : 'string numeric';
	data: string;
	driverParam: string;
}, MySqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MySqlDecimalBuilder';

	constructor(name: string, config: MySqlDecimalConfig | undefined) {
		super(name, (config?.unsigned ? 'string unumeric' : 'string numeric') as any, 'MySqlDecimal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlDecimal(
			table,
			this.config as any,
		);
	}
}

export class MySqlDecimal<T extends ColumnBaseConfig<'string numeric' | 'string unumeric'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlDecimalConfig>
{
	static override readonly [entityKind]: string = 'MySqlDecimal';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	override mapFromDriverValue(value: unknown): string {
		if (typeof value === 'string') return value;

		return String(value);
	}

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'decimal';
		} else {
			type += `decimal(${this.precision})`;
		}
		type = type === 'decimal(10,0)' || type === 'decimal(10)' ? 'decimal' : type;
		return this.unsigned ? `${type} unsigned` : type;
	}
}

export class MySqlDecimalNumberBuilder<TUnsigned extends boolean | undefined>
	extends MySqlColumnBuilderWithAutoIncrement<{
		dataType: Equal<TUnsigned, true> extends true ? 'number unsigned' : 'number';
		data: number;
		driverParam: string;
	}, MySqlDecimalConfig>
{
	static override readonly [entityKind]: string = 'MySqlDecimalNumberBuilder';

	constructor(name: string, config: MySqlDecimalConfig | undefined) {
		super(name, config?.unsigned ? 'number unsigned' : 'number' as any, 'MySqlDecimalNumber');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlDecimalNumber(
			table,
			this.config as any,
		);
	}
}

export class MySqlDecimalNumber<T extends ColumnBaseConfig<'number' | 'number unsigned'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlDecimalConfig>
{
	static override readonly [entityKind]: string = 'MySqlDecimalNumber';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	override mapFromDriverValue(value: unknown): number {
		if (typeof value === 'number') return value;

		return Number(value);
	}

	override mapToDriverValue = String;

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'decimal';
		} else {
			type += `decimal(${this.precision})`;
		}
		type = type === 'decimal(10,0)' || type === 'decimal(10)' ? 'decimal' : type;
		return this.unsigned ? `${type} unsigned` : type;
	}
}
export class MySqlDecimalBigIntBuilder<TUnsigned extends boolean | undefined>
	extends MySqlColumnBuilderWithAutoIncrement<{
		dataType: Equal<TUnsigned, true> extends true ? 'bigint uint64' : 'bigint int64';
		data: bigint;
		driverParam: string;
	}, MySqlDecimalConfig>
{
	static override readonly [entityKind]: string = 'MySqlDecimalBigIntBuilder';

	constructor(name: string, config: MySqlDecimalConfig | undefined) {
		super(name, config?.unsigned ? 'bigint uint64' : 'bigint int64' as any, 'MySqlDecimalBigInt');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlDecimalBigInt(
			table,
			this.config as any,
		);
	}
}

export class MySqlDecimalBigInt<T extends ColumnBaseConfig<'bigint int64' | 'bigint uint64'>>
	extends MySqlColumnWithAutoIncrement<T, MySqlDecimalConfig>
{
	static override readonly [entityKind]: string = 'MySqlDecimalBigInt';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	override mapFromDriverValue = BigInt;

	override mapToDriverValue = String;

	getSQLType(): string {
		let type = '';
		if (this.precision !== undefined && this.scale !== undefined) {
			type += `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			type += 'decimal';
		} else {
			type += `decimal(${this.precision})`;
		}
		type = type === 'decimal(10,0)' || type === 'decimal(10)' ? 'decimal' : type;
		return this.unsigned ? `${type} unsigned` : type;
	}
}

export interface MySqlDecimalConfig<
	T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint',
	TUnsigned extends boolean | undefined = boolean | undefined,
> {
	precision?: number;
	scale?: number;
	unsigned?: TUnsigned;
	mode?: T;
}

export function decimal<TMode extends 'string' | 'number' | 'bigint', TUnsigned extends boolean | undefined>(
	config?: MySqlDecimalConfig<TMode, TUnsigned>,
): Equal<TMode, 'number'> extends true ? MySqlDecimalNumberBuilder<TUnsigned>
	: Equal<TMode, 'bigint'> extends true ? MySqlDecimalBigIntBuilder<TUnsigned>
	: MySqlDecimalBuilder<TUnsigned>;
export function decimal<TMode extends 'string' | 'number' | 'bigint', TUnsigned extends boolean | undefined>(
	name: string,
	config?: MySqlDecimalConfig<TMode, TUnsigned>,
): Equal<TMode, 'number'> extends true ? MySqlDecimalNumberBuilder<TUnsigned>
	: Equal<TMode, 'bigint'> extends true ? MySqlDecimalBigIntBuilder<TUnsigned>
	: MySqlDecimalBuilder<TUnsigned>;
export function decimal(a?: string | MySqlDecimalConfig, b: MySqlDecimalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlDecimalConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new MySqlDecimalNumberBuilder(name, config)
		: mode === 'bigint'
		? new MySqlDecimalBigIntBuilder(name, config)
		: new MySqlDecimalBuilder(name, config);
}
