import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import {
	CockroachColumn,
	type CockroachColumnBaseConfig,
	CockroachColumnBuilder,
	type CockroachColumnBuilderRuntimeConfig,
} from './common.ts';

export class CockroachDecimalBuilder extends CockroachColumnBuilder<
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

export class CockroachDecimal<T extends CockroachColumnBaseConfig<'string numeric'>>
	extends CockroachColumn<'string numeric', T>
{
	static override readonly [entityKind]: string = 'CockroachDecimal';

	/** @internal */
	override readonly codec = 'decimal';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(
		table: CockroachTable<any>,
		config: CockroachColumnBuilderRuntimeConfig<T['data']> & {
			precision: number | undefined;
			scale: number | undefined;
		},
	) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
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

export class CockroachDecimalNumberBuilder extends CockroachColumnBuilder<
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

export class CockroachDecimalNumber<T extends CockroachColumnBaseConfig<'number'>>
	extends CockroachColumn<'number', T>
{
	static override readonly [entityKind]: string = 'CockroachDecimalNumber';

	/** @internal */
	override readonly codec = 'decimal:number';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(
		table: CockroachTable<any>,
		config: CockroachColumnBuilderRuntimeConfig<T['data']> & {
			precision: number | undefined;
			scale: number | undefined;
		},
	) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
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

export class CockroachDecimalBigIntBuilder extends CockroachColumnBuilder<
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

export class CockroachDecimalBigInt<T extends CockroachColumnBaseConfig<'bigint int64'>>
	extends CockroachColumn<'bigint int64', T>
{
	static override readonly [entityKind]: string = 'CockroachDecimalBigInt';

	/** @internal */
	override readonly codec = 'decimal:bigint';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(
		table: CockroachTable<any>,
		config: CockroachColumnBuilderRuntimeConfig<T['data']> & {
			precision: number | undefined;
			scale: number | undefined;
		},
	) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
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
