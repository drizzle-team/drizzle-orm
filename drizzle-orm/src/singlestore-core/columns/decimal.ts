import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export class SingleStoreDecimalBuilder extends SingleStoreColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'string numeric';
	data: string;
	driverParam: string;
	enumValues: undefined;
}, SingleStoreDecimalConfig> {
	static override readonly [entityKind]: string = 'SingleStoreDecimalBuilder';

	constructor(name: string, config: SingleStoreDecimalConfig | undefined) {
		super(name, 'string numeric', 'SingleStoreDecimal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreDecimal(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreDecimal<T extends ColumnBaseConfig<'string numeric'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreDecimalConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreDecimal';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;
	readonly unsigned: boolean | undefined = this.config.unsigned;

	override mapFromDriverValue(value: unknown): string {
		// For RQBv2
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

export class SingleStoreDecimalNumberBuilder extends SingleStoreColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'number';
	data: number;
	driverParam: string;
	enumValues: undefined;
}, SingleStoreDecimalConfig> {
	static override readonly [entityKind]: string = 'SingleStoreDecimalNumberBuilder';

	constructor(name: string, config: SingleStoreDecimalConfig | undefined) {
		super(name, 'number', 'SingleStoreDecimalNumber');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreDecimalNumber(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreDecimalNumber<T extends ColumnBaseConfig<'number'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreDecimalConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreDecimalNumber';

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

export class SingleStoreDecimalBigIntBuilder extends SingleStoreColumnBuilderWithAutoIncrement<{
	name: string;
	dataType: 'bigint';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}, SingleStoreDecimalConfig> {
	static override readonly [entityKind]: string = 'SingleStoreDecimalBigIntBuilder';

	constructor(name: string, config: SingleStoreDecimalConfig | undefined) {
		super(name, 'bigint', 'SingleStoreDecimalBigInt');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreDecimalBigInt(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreDecimalBigInt<T extends ColumnBaseConfig<'bigint'>>
	extends SingleStoreColumnWithAutoIncrement<T, SingleStoreDecimalConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreDecimalBigInt';

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

export interface SingleStoreDecimalConfig<T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint'> {
	precision?: number;
	scale?: number;
	unsigned?: boolean;
	mode?: T;
}

export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	config?: SingleStoreDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? SingleStoreDecimalNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? SingleStoreDecimalBigIntBuilder
	: SingleStoreDecimalBuilder;
export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	name: string,
	config?: SingleStoreDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? SingleStoreDecimalNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? SingleStoreDecimalBigIntBuilder
	: SingleStoreDecimalBuilder;
export function decimal(a?: string | SingleStoreDecimalConfig, b: SingleStoreDecimalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<SingleStoreDecimalConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new SingleStoreDecimalNumberBuilder(name, config)
		: mode === 'bigint'
		? new SingleStoreDecimalBigIntBuilder(name, config)
		: new SingleStoreDecimalBuilder(name, config);
}
