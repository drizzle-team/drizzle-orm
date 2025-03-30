import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumnBuilderWithAutoIncrement, MySqlColumnWithAutoIncrement } from './common.ts';

export type MySqlDecimalBuilderInitial<TName extends string> = MySqlDecimalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MySqlDecimal';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlDecimalBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'MySqlDecimal'>,
> extends MySqlColumnBuilderWithAutoIncrement<T, MySqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MySqlDecimalBuilder';

	constructor(name: T['name'], config: MySqlDecimalConfig | undefined) {
		super(name, 'string', 'MySqlDecimal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDecimal<MakeColumnConfig<T, TTableName>> {
		return new MySqlDecimal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlDecimal<T extends ColumnBaseConfig<'string', 'MySqlDecimal'>>
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

export type MySqlDecimalNumberBuilderInitial<TName extends string> = MySqlDecimalNumberBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MySqlDecimalNumber';
	data: number;
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlDecimalNumberBuilder<
	T extends ColumnBuilderBaseConfig<'number', 'MySqlDecimalNumber'>,
> extends MySqlColumnBuilderWithAutoIncrement<T, MySqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MySqlDecimalNumberBuilder';

	constructor(name: T['name'], config: MySqlDecimalConfig | undefined) {
		super(name, 'number', 'MySqlDecimalNumber');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDecimalNumber<MakeColumnConfig<T, TTableName>> {
		return new MySqlDecimalNumber<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlDecimalNumber<T extends ColumnBaseConfig<'number', 'MySqlDecimalNumber'>>
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

export type MySqlDecimalBigIntBuilderInitial<TName extends string> = MySqlDecimalBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'MySqlDecimalBigInt';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlDecimalBigIntBuilder<
	T extends ColumnBuilderBaseConfig<'bigint', 'MySqlDecimalBigInt'>,
> extends MySqlColumnBuilderWithAutoIncrement<T, MySqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MySqlDecimalBigIntBuilder';

	constructor(name: T['name'], config: MySqlDecimalConfig | undefined) {
		super(name, 'bigint', 'MySqlDecimalBigInt');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
		this.config.unsigned = config?.unsigned;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlDecimalBigInt<MakeColumnConfig<T, TTableName>> {
		return new MySqlDecimalBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MySqlDecimalBigInt<T extends ColumnBaseConfig<'bigint', 'MySqlDecimalBigInt'>>
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

export function decimal(): MySqlDecimalBuilderInitial<''>;
export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	config: MySqlDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MySqlDecimalNumberBuilderInitial<''>
	: Equal<TMode, 'bigint'> extends true ? MySqlDecimalBigIntBuilderInitial<''>
	: MySqlDecimalBuilderInitial<''>;
export function decimal<TName extends string, TMode extends 'string' | 'number' | 'bigint'>(
	name: TName,
	config?: MySqlDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MySqlDecimalNumberBuilderInitial<TName>
	: Equal<TMode, 'bigint'> extends true ? MySqlDecimalBigIntBuilderInitial<TName>
	: MySqlDecimalBuilderInitial<TName>;
export function decimal(a?: string | MySqlDecimalConfig, b: MySqlDecimalConfig = {}) {
	const { name, config } = getColumnNameAndConfig<MySqlDecimalConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new MySqlDecimalNumberBuilder(name, config)
		: mode === 'bigint'
		? new MySqlDecimalBigIntBuilder(name, config)
		: new MySqlDecimalBuilder(name, config);
}
