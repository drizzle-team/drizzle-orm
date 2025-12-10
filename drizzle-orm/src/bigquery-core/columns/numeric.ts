import type { AnyBigQueryTable } from '~/bigquery-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { BigQueryColumn, BigQueryColumnBuilder } from './common.ts';

// NUMERIC - precision up to 38 digits, scale up to 9 digits
// Stored as string to preserve precision
export type BigQueryNumericBuilderInitial<TName extends string> = BigQueryNumericBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'BigQueryNumeric';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryNumericBuilder<T extends ColumnBuilderBaseConfig<'string', 'BigQueryNumeric'>>
	extends BigQueryColumnBuilder<T, { precision: number | undefined; scale: number | undefined }>
{
	static override readonly [entityKind]: string = 'BigQueryNumericBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'string', 'BigQueryNumeric');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryNumeric<MakeColumnConfig<T, TTableName>> {
		return new BigQueryNumeric<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryNumeric<T extends ColumnBaseConfig<'string', 'BigQueryNumeric'>>
	extends BigQueryColumn<T, { precision: number | undefined; scale: number | undefined }>
{
	static override readonly [entityKind]: string = 'BigQueryNumeric';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `NUMERIC(${this.precision}, ${this.scale})`;
		}
		if (this.precision !== undefined) {
			return `NUMERIC(${this.precision})`;
		}
		return 'NUMERIC';
	}

	override mapFromDriverValue(value: string | number | { value: string }): string {
		if (typeof value === 'object' && 'value' in value) {
			return value.value;
		}
		return String(value);
	}
}

export interface BigQueryNumericConfig {
	precision?: number;
	scale?: number;
}

export function numeric(): BigQueryNumericBuilderInitial<''>;
export function numeric<TName extends string>(name: TName): BigQueryNumericBuilderInitial<TName>;
export function numeric(config: BigQueryNumericConfig): BigQueryNumericBuilderInitial<''>;
export function numeric<TName extends string>(
	name: TName,
	config: BigQueryNumericConfig,
): BigQueryNumericBuilderInitial<TName>;
export function numeric(a?: string | BigQueryNumericConfig, b?: BigQueryNumericConfig) {
	const { name, config } = getColumnNameAndConfig<BigQueryNumericConfig | undefined>(a, b);
	return new BigQueryNumericBuilder(name, config?.precision, config?.scale);
}

// BIGNUMERIC - precision up to 76.76 digits (38.38 before and after decimal)
export type BigQueryBigNumericBuilderInitial<TName extends string> = BigQueryBigNumericBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'BigQueryBigNumeric';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class BigQueryBigNumericBuilder<T extends ColumnBuilderBaseConfig<'string', 'BigQueryBigNumeric'>>
	extends BigQueryColumnBuilder<T, { precision: number | undefined; scale: number | undefined }>
{
	static override readonly [entityKind]: string = 'BigQueryBigNumericBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'string', 'BigQueryBigNumeric');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyBigQueryTable<{ name: TTableName }>,
	): BigQueryBigNumeric<MakeColumnConfig<T, TTableName>> {
		return new BigQueryBigNumeric<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class BigQueryBigNumeric<T extends ColumnBaseConfig<'string', 'BigQueryBigNumeric'>>
	extends BigQueryColumn<T, { precision: number | undefined; scale: number | undefined }>
{
	static override readonly [entityKind]: string = 'BigQueryBigNumeric';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `BIGNUMERIC(${this.precision}, ${this.scale})`;
		}
		if (this.precision !== undefined) {
			return `BIGNUMERIC(${this.precision})`;
		}
		return 'BIGNUMERIC';
	}

	override mapFromDriverValue(value: string | number | { value: string }): string {
		if (typeof value === 'object' && 'value' in value) {
			return value.value;
		}
		return String(value);
	}
}

export function bignumeric(): BigQueryBigNumericBuilderInitial<''>;
export function bignumeric<TName extends string>(name: TName): BigQueryBigNumericBuilderInitial<TName>;
export function bignumeric(config: BigQueryNumericConfig): BigQueryBigNumericBuilderInitial<''>;
export function bignumeric<TName extends string>(
	name: TName,
	config: BigQueryNumericConfig,
): BigQueryBigNumericBuilderInitial<TName>;
export function bignumeric(a?: string | BigQueryNumericConfig, b?: BigQueryNumericConfig) {
	const { name, config } = getColumnNameAndConfig<BigQueryNumericConfig | undefined>(a, b);
	return new BigQueryBigNumericBuilder(name, config?.precision, config?.scale);
}
