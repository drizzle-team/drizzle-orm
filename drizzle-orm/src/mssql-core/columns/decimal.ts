import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlDecimalBuilderInitial<TName extends string> = MsSqlDecimalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlDecimal';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class MsSqlDecimalBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'MsSqlDecimal'>,
> extends MsSqlColumnBuilderWithIdentity<T, MsSqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MsSqlDecimalBuilder';

	constructor(name: T['name'], config: MsSqlDecimalConfig | undefined) {
		super(name, 'string', 'MsSqlDecimal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDecimal<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDecimal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlDecimal<T extends ColumnBaseConfig<'string', 'MsSqlDecimal'>>
	extends MsSqlColumnWithIdentity<T, MsSqlDecimalConfig>
{
	static override readonly [entityKind]: string = 'MsSqlDecimal';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	override mapFromDriverValue(value: unknown): string {
		if (typeof value === 'string') return value;

		return String(value);
	}

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'decimal';
		} else {
			return `decimal(${this.precision})`;
		}
	}
}

export type MsSqlDecimalNumberBuilderInitial<TName extends string> = MsSqlDecimalNumberBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlDecimalNumber';
	data: number;
	driverParam: string;
	enumValues: undefined;
}>;

export class MsSqlDecimalNumberBuilder<
	T extends ColumnBuilderBaseConfig<'number', 'MsSqlDecimalNumber'>,
> extends MsSqlColumnBuilderWithIdentity<T, MsSqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MsSqlDecimalNumberBuilder';

	constructor(name: T['name'], config: MsSqlDecimalConfig | undefined) {
		super(name, 'number', 'MsSqlDecimalNumber');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDecimalNumber<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDecimalNumber<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlDecimalNumber<T extends ColumnBaseConfig<'number', 'MsSqlDecimalNumber'>>
	extends MsSqlColumnWithIdentity<T, MsSqlDecimalConfig>
{
	static override readonly [entityKind]: string = 'MsSqlDecimalNumber';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	override mapFromDriverValue(value: unknown): number {
		if (typeof value === 'number') return value;

		return Number(value);
	}

	override mapToDriverValue = String;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'decimal';
		} else {
			return `decimal(${this.precision})`;
		}
	}
}

export type MsSqlDecimalBigIntBuilderInitial<TName extends string> = MsSqlDecimalBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'MsSqlDecimalBigInt';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class MsSqlDecimalBigIntBuilder<
	T extends ColumnBuilderBaseConfig<'bigint', 'MsSqlDecimalBigInt'>,
> extends MsSqlColumnBuilderWithIdentity<T, MsSqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MsSqlDecimalBigIntBuilder';

	constructor(name: T['name'], config: MsSqlDecimalConfig | undefined) {
		super(name, 'bigint', 'MsSqlDecimalBigInt');
		this.config.precision = config?.precision ?? 18;
		this.config.scale = config?.scale ?? 0;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlDecimalBigInt<MakeColumnConfig<T, TTableName>> {
		return new MsSqlDecimalBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlDecimalBigInt<T extends ColumnBaseConfig<'bigint', 'MsSqlDecimalBigInt'>>
	extends MsSqlColumnWithIdentity<T, MsSqlDecimalConfig>
{
	static override readonly [entityKind]: string = 'MsSqlDecimalBigInt';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	override mapFromDriverValue = BigInt;

	override mapToDriverValue = String;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `decimal(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'decimal';
		} else {
			return `decimal(${this.precision})`;
		}
	}
}

export interface MsSqlDecimalConfig<T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint'> {
	precision?: number;
	scale?: number;
	mode?: T;
}

export function decimal(): MsSqlDecimalBuilderInitial<''>;
export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	config: MsSqlDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MsSqlDecimalNumberBuilderInitial<''>
	: Equal<TMode, 'bigint'> extends true ? MsSqlDecimalBigIntBuilderInitial<''>
	: MsSqlDecimalBuilderInitial<''>;
export function decimal<TName extends string, TMode extends 'string' | 'number' | 'bigint'>(
	name: TName,
	config?: MsSqlDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MsSqlDecimalNumberBuilderInitial<TName>
	: Equal<TMode, 'bigint'> extends true ? MsSqlDecimalBigIntBuilderInitial<TName>
	: MsSqlDecimalBuilderInitial<TName>;
export function decimal(a?: string | MsSqlDecimalConfig, b?: MsSqlDecimalConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlDecimalConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new MsSqlDecimalNumberBuilder(name, config)
		: mode === 'bigint'
		? new MsSqlDecimalBigIntBuilder(name, config)
		: new MsSqlDecimalBuilder(name, config);
}
