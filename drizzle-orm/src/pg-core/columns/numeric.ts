import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgNumericBuilderInitial<TName extends string> = PgNumericBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgNumeric';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgNumericBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgNumeric'>> extends PgColumnBuilder<
	T,
	{
		precision: number | undefined;
		scale: number | undefined;
	}
> {
	static override readonly [entityKind]: string = 'PgNumericBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'string', 'PgNumeric');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgNumeric<MakeColumnConfig<T, TTableName>> {
		return new PgNumeric<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgNumeric<T extends ColumnBaseConfig<'string', 'PgNumeric'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgNumeric';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgNumericBuilder<T>['config']) {
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

export type PgNumericNumberBuilderInitial<TName extends string> = PgNumericNumberBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'PgNumericNumber';
	data: number;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgNumericNumberBuilder<T extends ColumnBuilderBaseConfig<'number', 'PgNumericNumber'>>
	extends PgColumnBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'PgNumericNumberBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'number', 'PgNumericNumber');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgNumericNumber<MakeColumnConfig<T, TTableName>> {
		return new PgNumericNumber<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgNumericNumber<T extends ColumnBaseConfig<'number', 'PgNumericNumber'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgNumericNumber';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgNumericNumberBuilder<T>['config']) {
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

export type PgNumericBigIntBuilderInitial<TName extends string> = PgNumericBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'PgNumericBigInt';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgNumericBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint', 'PgNumericBigInt'>>
	extends PgColumnBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'PgNumericBigIntBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'bigint', 'PgNumericBigInt');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgNumericBigInt<MakeColumnConfig<T, TTableName>> {
		return new PgNumericBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgNumericBigInt<T extends ColumnBaseConfig<'bigint', 'PgNumericBigInt'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgNumericBigInt';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgNumericBigIntBuilder<T>['config']) {
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

export type PgNumericConfig<T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint'> =
	| { precision: number; scale?: number; mode?: T }
	| { precision?: number; scale: number; mode?: T }
	| { precision?: number; scale?: number; mode: T };

export function numeric<TMode extends 'string' | 'number' | 'bigint'>(
	config?: PgNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? PgNumericNumberBuilderInitial<''>
	: Equal<TMode, 'bigint'> extends true ? PgNumericBigIntBuilderInitial<''>
	: PgNumericBuilderInitial<''>;
export function numeric<TName extends string, TMode extends 'string' | 'number' | 'bigint'>(
	name: TName,
	config?: PgNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? PgNumericNumberBuilderInitial<TName>
	: Equal<TMode, 'bigint'> extends true ? PgNumericBigIntBuilderInitial<TName>
	: PgNumericBuilderInitial<TName>;
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
