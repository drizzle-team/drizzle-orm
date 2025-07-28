import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export class MySqlDecimalBuilder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'string';
	data: string;
	driverParam: string;
	enumValues: undefined;
}, MySqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MySqlDecimalBuilder';

	constructor(name: string, config: MySqlDecimalConfig | undefined) {
		super(name, 'string', 'MySqlDecimal');
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

export class MySqlDecimal<T extends ColumnBaseConfig<'string'>>
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

export class MySqlDecimalNumberBuilder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number';
	data: number;
	driverParam: string;
	enumValues: undefined;
}, MySqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MySqlDecimalNumberBuilder';

	constructor(name: string, config: MySqlDecimalConfig | undefined) {
		super(name, 'number', 'MySqlDecimalNumber');
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

export class MySqlDecimalNumber<T extends ColumnBaseConfig<'number'>>
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
export class MySqlDecimalBigIntBuilder extends MySqlColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'bigint';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}, MySqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MySqlDecimalBigIntBuilder';

	constructor(name: string, config: MySqlDecimalConfig | undefined) {
		super(name, 'bigint', 'MySqlDecimalBigInt');
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

export class MySqlDecimalBigInt<T extends ColumnBaseConfig<'bigint'>>
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

export interface MySqlDecimalConfig<T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint'> {
	precision?: number;
	scale?: number;
	unsigned?: boolean;
	mode?: T;
}

export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	config?: MySqlDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MySqlDecimalNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? MySqlDecimalBigIntBuilder
	: MySqlDecimalBuilder;
export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	name: string,
	config?: MySqlDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MySqlDecimalNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? MySqlDecimalBigIntBuilder
	: MySqlDecimalBuilder;
export function decimal(a?: string | MySqlDecimalConfig, b: MySqlDecimalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlDecimalConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new MySqlDecimalNumberBuilder(name, config)
		: mode === 'bigint'
		? new MySqlDecimalBigIntBuilder(name, config)
		: new MySqlDecimalBuilder(name, config);
}
