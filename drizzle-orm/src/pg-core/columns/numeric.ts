import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgNumericBuilder extends PgColumnBuilder<
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
	static override readonly [entityKind]: string = 'PgNumericBuilder';

	constructor(name: string, precision?: number, scale?: number) {
		super(name, 'string numeric', 'PgNumeric');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgNumeric(table, this.config as any);
	}
}

export class PgNumeric extends PgColumn<'string numeric'> {
	static override readonly [entityKind]: string = 'PgNumeric';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: PgTable<any>, config: PgNumericBuilder['config']) {
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
			return `numeric(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export class PgNumericNumberBuilder extends PgColumnBuilder<
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
	static override readonly [entityKind]: string = 'PgNumericNumberBuilder';

	constructor(name: string, precision?: number, scale?: number) {
		super(name, 'number', 'PgNumericNumber');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgNumericNumber(
			table,
			this.config as any,
		);
	}
}

export class PgNumericNumber extends PgColumn<'number'> {
	static override readonly [entityKind]: string = 'PgNumericNumber';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: PgTable<any>, config: PgNumericNumberBuilder['config']) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

	override mapFromDriverValue(value: unknown): number {
		if (typeof value === 'number') return value;

		return Number(value);
	}

	override mapToDriverValue(value: number): string {
		return String(value);
	}

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `numeric(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export class PgNumericBigIntBuilder extends PgColumnBuilder<
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
	static override readonly [entityKind]: string = 'PgNumericBigIntBuilder';

	constructor(name: string, precision?: number, scale?: number) {
		super(name, 'bigint int64', 'PgNumericBigInt');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgNumericBigInt(
			table,
			this.config as any,
		);
	}
}

export class PgNumericBigInt extends PgColumn<'bigint int64'> {
	static override readonly [entityKind]: string = 'PgNumericBigInt';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: PgTable<any>, config: PgNumericBigIntBuilder['config']) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

	override mapFromDriverValue(value: string | number): bigint {
		return BigInt(value);
	}

	override mapToDriverValue(value: bigint): string {
		return String(value);
	}

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `numeric(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export type PgNumericConfig<T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint'> =
	| { precision: number; scale?: number; mode?: T }
	| { precision?: number; scale: number; mode?: T }
	| { precision?: number; scale?: number; mode: T };

export function numeric<TMode extends 'string' | 'number' | 'bigint'>(
	config?: PgNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? PgNumericNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? PgNumericBigIntBuilder
	: PgNumericBuilder;
export function numeric<TMode extends 'string' | 'number' | 'bigint'>(
	name: string,
	config?: PgNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? PgNumericNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? PgNumericBigIntBuilder
	: PgNumericBuilder;
export function numeric(a?: string | PgNumericConfig, b?: PgNumericConfig) {
	const { name, config } = getColumnNameAndConfig<PgNumericConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new PgNumericNumberBuilder(name, config?.precision, config?.scale)
		: mode === 'bigint'
		? new PgNumericBigIntBuilder(name, config?.precision, config?.scale)
		: new PgNumericBuilder(name, config?.precision, config?.scale);
}

export const decimal = numeric;
