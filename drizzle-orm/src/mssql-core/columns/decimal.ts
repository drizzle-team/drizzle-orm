import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export class MsSqlDecimalBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'string numeric';
	data: string;
	driverParam: string;
}, MsSqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MsSqlDecimalBuilder';

	constructor(name: string, config: MsSqlDecimalConfig | undefined) {
		super(name, 'string numeric', 'MsSqlDecimal');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlDecimal(
			table,
			this.config,
		);
	}
}

export class MsSqlDecimal<T extends ColumnBaseConfig<'string numeric'>>
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

export class MsSqlDecimalNumberBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'number';
	data: number;
	driverParam: string;
}, MsSqlDecimalConfig> {
	static override readonly [entityKind]: string = 'MsSqlDecimalNumberBuilder';

	constructor(name: string, config: MsSqlDecimalConfig | undefined) {
		super(name, 'number', 'MsSqlDecimalNumber');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlDecimalNumber(
			table,
			this.config,
		);
	}
}

export class MsSqlDecimalNumber<T extends ColumnBaseConfig<'number'>>
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

export class MsSqlDecimalBigIntBuilder extends MsSqlColumnBuilderWithIdentity<
	{
		dataType: 'bigint int64';
		data: bigint;
		driverParam: string;
	},
	MsSqlDecimalConfig
> {
	static override readonly [entityKind]: string = 'MsSqlDecimalBigIntBuilder';

	constructor(name: string, config: MsSqlDecimalConfig | undefined) {
		super(name, 'bigint int64', 'MsSqlDecimalBigInt');
		this.config.precision = config?.precision ?? 18;
		this.config.scale = config?.scale ?? 0;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlDecimalBigInt(
			table,
			this.config,
		);
	}
}

export class MsSqlDecimalBigInt<T extends ColumnBaseConfig<'bigint int64'>>
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

export interface MsSqlDecimalConfig<
	T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint',
> {
	precision?: number;
	scale?: number;
	mode?: T;
}

export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	config?: MsSqlDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MsSqlDecimalNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? MsSqlDecimalBigIntBuilder
	: MsSqlDecimalBuilder;
export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	name: string,
	config?: MsSqlDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MsSqlDecimalNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? MsSqlDecimalBigIntBuilder
	: MsSqlDecimalBuilder;
export function decimal(a?: string | MsSqlDecimalConfig, b?: MsSqlDecimalConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlDecimalConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new MsSqlDecimalNumberBuilder(name, config)
		: mode === 'bigint'
		? new MsSqlDecimalBigIntBuilder(name, config)
		: new MsSqlDecimalBuilder(name, config);
}
