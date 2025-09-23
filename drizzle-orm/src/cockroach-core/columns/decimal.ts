import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export class CockroachDecimalBuilder extends CockroachColumnWithArrayBuilder<
	{
		dataType: 'string numeric';
		data: string;
		driverParam: string;
	},
	{
		precision: number | undefined;
		scale: number | undefined;
	}
> {
	static override readonly [entityKind]: string = 'CockroachDecimalBuilder';

	constructor(name: string, precision?: number, scale?: number) {
		super(name, 'string numeric', 'CockroachDecimal');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachDecimal(
			table,
			this.config,
		);
	}
}

export class CockroachDecimal<T extends ColumnBaseConfig<'string numeric'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDecimal';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: CockroachTable<any>, config: CockroachDecimalBuilder['config']) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

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

export class CockroachDecimalNumberBuilder extends CockroachColumnWithArrayBuilder<
	{
		dataType: 'number';
		data: number;
		driverParam: string;
	},
	{
		precision: number | undefined;
		scale: number | undefined;
	}
> {
	static override readonly [entityKind]: string = 'CockroachDecimalNumberBuilder';

	constructor(name: string, precision?: number, scale?: number) {
		super(name, 'number', 'CockroachDecimalNumber');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachDecimalNumber(
			table,
			this.config,
		);
	}
}

export class CockroachDecimalNumber<T extends ColumnBaseConfig<'number'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDecimalNumber';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(
		table: CockroachTable<any>,
		config: CockroachDecimalNumberBuilder['config'],
	) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

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

export class CockroachDecimalBigIntBuilder extends CockroachColumnWithArrayBuilder<
	{
		dataType: 'bigint int64';
		data: bigint;
		driverParam: string;
	},
	{
		precision: number | undefined;
		scale: number | undefined;
	}
> {
	static override readonly [entityKind]: string = 'CockroachDecimalBigIntBuilder';

	constructor(name: string, precision?: number, scale?: number) {
		super(name, 'bigint int64', 'CockroachDecimalBigInt');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachDecimalBigInt(
			table,
			this.config,
		);
	}
}

export class CockroachDecimalBigInt<T extends ColumnBaseConfig<'bigint int64'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDecimalBigInt';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(
		table: CockroachTable<any>,
		config: CockroachDecimalBigIntBuilder['config'],
	) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

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

export type CockroachDecimalConfig<
	T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint',
> =
	| { precision: number; scale?: number; mode?: T }
	| { precision?: number; scale: number; mode?: T }
	| { precision?: number; scale?: number; mode: T };

export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	config?: CockroachDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? CockroachDecimalNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? CockroachDecimalBigIntBuilder
	: CockroachDecimalBuilder;
export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	name: string,
	config?: CockroachDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? CockroachDecimalNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? CockroachDecimalBigIntBuilder
	: CockroachDecimalBuilder;
export function decimal(a?: string | CockroachDecimalConfig, b?: CockroachDecimalConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachDecimalConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new CockroachDecimalNumberBuilder(name, config?.precision, config?.scale)
		: mode === 'bigint'
		? new CockroachDecimalBigIntBuilder(name, config?.precision, config?.scale)
		: new CockroachDecimalBuilder(name, config?.precision, config?.scale);
}

// numeric is alias for decimal
export const numeric = decimal;
