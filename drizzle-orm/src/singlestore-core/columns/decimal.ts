import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumnBuilderWithAutoIncrement, SingleStoreColumnWithAutoIncrement } from './common.ts';

export type SingleStoreDecimalBuilderInitial<TName extends string> = SingleStoreDecimalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreDecimal';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreDecimalBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'SingleStoreDecimal'>,
> extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreDecimalConfig> {
	static override readonly [entityKind]: string = 'SingleStoreDecimalBuilder';

	constructor(name: T['name'], config: SingleStoreDecimalConfig | undefined) {
		super(name, 'string', 'SingleStoreDecimal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreDecimal<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreDecimal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreDecimal<T extends ColumnBaseConfig<'string', 'SingleStoreDecimal'>>
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

export type SingleStoreDecimalNumberBuilderInitial<TName extends string> = SingleStoreDecimalNumberBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SingleStoreDecimalNumber';
	data: number;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreDecimalNumberBuilder<
	T extends ColumnBuilderBaseConfig<'number', 'SingleStoreDecimalNumber'>,
> extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreDecimalConfig> {
	static override readonly [entityKind]: string = 'SingleStoreDecimalNumberBuilder';

	constructor(name: T['name'], config: SingleStoreDecimalConfig | undefined) {
		super(name, 'number', 'SingleStoreDecimalNumber');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreDecimalNumber<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreDecimalNumber<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreDecimalNumber<T extends ColumnBaseConfig<'number', 'SingleStoreDecimalNumber'>>
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

export type SingleStoreDecimalBigIntBuilderInitial<TName extends string> = SingleStoreDecimalBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'SingleStoreDecimalBigInt';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreDecimalBigIntBuilder<
	T extends ColumnBuilderBaseConfig<'bigint', 'SingleStoreDecimalBigInt'>,
> extends SingleStoreColumnBuilderWithAutoIncrement<T, SingleStoreDecimalConfig> {
	static override readonly [entityKind]: string = 'SingleStoreDecimalBigIntBuilder';

	constructor(name: T['name'], config: SingleStoreDecimalConfig | undefined) {
		super(name, 'bigint', 'SingleStoreDecimalBigInt');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreDecimalBigInt<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreDecimalBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreDecimalBigInt<T extends ColumnBaseConfig<'bigint', 'SingleStoreDecimalBigInt'>>
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

export function decimal(): SingleStoreDecimalBuilderInitial<''>;
export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	config: SingleStoreDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? SingleStoreDecimalNumberBuilderInitial<''>
	: Equal<TMode, 'bigint'> extends true ? SingleStoreDecimalBigIntBuilderInitial<''>
	: SingleStoreDecimalBuilderInitial<''>;
export function decimal<TName extends string, TMode extends 'string' | 'number' | 'bigint'>(
	name: TName,
	config?: SingleStoreDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? SingleStoreDecimalNumberBuilderInitial<TName>
	: Equal<TMode, 'bigint'> extends true ? SingleStoreDecimalBigIntBuilderInitial<TName>
	: SingleStoreDecimalBuilderInitial<TName>;
export function decimal(a?: string | SingleStoreDecimalConfig, b: SingleStoreDecimalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<SingleStoreDecimalConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new SingleStoreDecimalNumberBuilder(name, config)
		: mode === 'bigint'
		? new SingleStoreDecimalBigIntBuilder(name, config)
		: new SingleStoreDecimalBuilder(name, config);
}
