import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachDecimalBuilderInitial<TName extends string> = CockroachDecimalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachDecimal';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDecimalBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachDecimal'>>
	extends CockroachColumnWithArrayBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'CockroachDecimalBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'string', 'CockroachDecimal');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachDecimal<MakeColumnConfig<T, TTableName>> {
		return new CockroachDecimal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDecimal<T extends ColumnBaseConfig<'string', 'CockroachDecimal'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDecimal';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyCockroachTable<{ name: T['tableName'] }>, config: CockroachDecimalBuilder<T>['config']) {
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
			return `decimal(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'decimal';
		} else {
			return `decimal(${this.precision})`;
		}
	}
}

export type CockroachDecimalNumberBuilderInitial<TName extends string> = CockroachDecimalNumberBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachDecimalNumber';
	data: number;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDecimalNumberBuilder<T extends ColumnBuilderBaseConfig<'number', 'CockroachDecimalNumber'>>
	extends CockroachColumnWithArrayBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'CockroachDecimalNumberBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'number', 'CockroachDecimalNumber');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachDecimalNumber<MakeColumnConfig<T, TTableName>> {
		return new CockroachDecimalNumber<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDecimalNumber<T extends ColumnBaseConfig<'number', 'CockroachDecimalNumber'>>
	extends CockroachColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDecimalNumber';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(
		table: AnyCockroachTable<{ name: T['tableName'] }>,
		config: CockroachDecimalNumberBuilder<T>['config'],
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
			return `decimal(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'decimal';
		} else {
			return `decimal(${this.precision})`;
		}
	}
}

export type CockroachDecimalBigIntBuilderInitial<TName extends string> = CockroachDecimalBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'CockroachDecimalBigInt';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDecimalBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint', 'CockroachDecimalBigInt'>>
	extends CockroachColumnWithArrayBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'CockroachDecimalBigIntBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'bigint', 'CockroachDecimalBigInt');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachDecimalBigInt<MakeColumnConfig<T, TTableName>> {
		return new CockroachDecimalBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDecimalBigInt<T extends ColumnBaseConfig<'bigint', 'CockroachDecimalBigInt'>>
	extends CockroachColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDecimalBigInt';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(
		table: AnyCockroachTable<{ name: T['tableName'] }>,
		config: CockroachDecimalBigIntBuilder<T>['config'],
	) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

	override mapFromDriverValue = BigInt;

	override mapToDriverValue = String;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `decimal(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'decimal';
		} else {
			return `decimal(${this.precision})`;
		}
	}
}

export type CockroachDecimalConfig<T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint'> =
	| { precision: number; scale?: number; mode?: T }
	| { precision?: number; scale: number; mode?: T }
	| { precision?: number; scale?: number; mode: T };

export function decimal<TMode extends 'string' | 'number' | 'bigint'>(
	config?: CockroachDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? CockroachDecimalNumberBuilderInitial<''>
	: Equal<TMode, 'bigint'> extends true ? CockroachDecimalBigIntBuilderInitial<''>
	: CockroachDecimalBuilderInitial<''>;
export function decimal<TName extends string, TMode extends 'string' | 'number' | 'bigint'>(
	name: TName,
	config?: CockroachDecimalConfig<TMode>,
): Equal<TMode, 'number'> extends true ? CockroachDecimalNumberBuilderInitial<TName>
	: Equal<TMode, 'bigint'> extends true ? CockroachDecimalBigIntBuilderInitial<TName>
	: CockroachDecimalBuilderInitial<TName>;
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
