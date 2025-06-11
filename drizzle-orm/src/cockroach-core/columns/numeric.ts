import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachNumericBuilderInitial<TName extends string> = CockroachNumericBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachNumeric';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachNumericBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachNumeric'>>
	extends CockroachColumnWithArrayBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'CockroachNumericBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'string', 'CockroachNumeric');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachNumeric<MakeColumnConfig<T, TTableName>> {
		return new CockroachNumeric<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachNumeric<T extends ColumnBaseConfig<'string', 'CockroachNumeric'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachNumeric';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyCockroachTable<{ name: T['tableName'] }>, config: CockroachNumericBuilder<T>['config']) {
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

export type CockroachNumericNumberBuilderInitial<TName extends string> = CockroachNumericNumberBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachNumericNumber';
	data: number;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachNumericNumberBuilder<T extends ColumnBuilderBaseConfig<'number', 'CockroachNumericNumber'>>
	extends CockroachColumnWithArrayBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'CockroachNumericNumberBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'number', 'CockroachNumericNumber');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachNumericNumber<MakeColumnConfig<T, TTableName>> {
		return new CockroachNumericNumber<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachNumericNumber<T extends ColumnBaseConfig<'number', 'CockroachNumericNumber'>>
	extends CockroachColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachNumericNumber';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(
		table: AnyCockroachTable<{ name: T['tableName'] }>,
		config: CockroachNumericNumberBuilder<T>['config'],
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
			return `numeric(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export type CockroachNumericBigIntBuilderInitial<TName extends string> = CockroachNumericBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'CockroachNumericBigInt';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachNumericBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint', 'CockroachNumericBigInt'>>
	extends CockroachColumnWithArrayBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'CockroachNumericBigIntBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'bigint', 'CockroachNumericBigInt');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachNumericBigInt<MakeColumnConfig<T, TTableName>> {
		return new CockroachNumericBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachNumericBigInt<T extends ColumnBaseConfig<'bigint', 'CockroachNumericBigInt'>>
	extends CockroachColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachNumericBigInt';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(
		table: AnyCockroachTable<{ name: T['tableName'] }>,
		config: CockroachNumericBigIntBuilder<T>['config'],
	) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

	override mapFromDriverValue = BigInt;

	override mapToDriverValue = String;

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

export type CockroachNumericConfig<T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint'> =
	| { precision: number; scale?: number; mode?: T }
	| { precision?: number; scale: number; mode?: T }
	| { precision?: number; scale?: number; mode: T };

export function numeric<TMode extends 'string' | 'number' | 'bigint'>(
	config?: CockroachNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? CockroachNumericNumberBuilderInitial<''>
	: Equal<TMode, 'bigint'> extends true ? CockroachNumericBigIntBuilderInitial<''>
	: CockroachNumericBuilderInitial<''>;
export function numeric<TName extends string, TMode extends 'string' | 'number' | 'bigint'>(
	name: TName,
	config?: CockroachNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? CockroachNumericNumberBuilderInitial<TName>
	: Equal<TMode, 'bigint'> extends true ? CockroachNumericBigIntBuilderInitial<TName>
	: CockroachNumericBuilderInitial<TName>;
export function numeric(a?: string | CockroachNumericConfig, b?: CockroachNumericConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachNumericConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new CockroachNumericNumberBuilder(name, config?.precision, config?.scale)
		: mode === 'bigint'
		? new CockroachNumericBigIntBuilder(name, config?.precision, config?.scale)
		: new CockroachNumericBuilder(name, config?.precision, config?.scale);
}

export const decimal = numeric;
