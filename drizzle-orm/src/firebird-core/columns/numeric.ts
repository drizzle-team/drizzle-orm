import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyFirebirdTable } from '~/firebird-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { FirebirdColumn, FirebirdColumnBuilder } from './common.ts';

export type FirebirdNumericBuilderInitial<TName extends string> = FirebirdNumericBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'FirebirdNumeric';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class FirebirdNumericBuilder<T extends ColumnBuilderBaseConfig<'string', 'FirebirdNumeric'>> extends FirebirdColumnBuilder<
	T,
	{
		precision: number | undefined;
		scale: number | undefined;
	}
> {
	static override readonly [entityKind]: string = 'FirebirdNumericBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'string', 'FirebirdNumeric');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdNumeric<MakeColumnConfig<T, TTableName>> {
		return new FirebirdNumeric<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class FirebirdNumeric<T extends ColumnBaseConfig<'string', 'FirebirdNumeric'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdNumeric';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyFirebirdTable<{ name: T['tableName'] }>, config: FirebirdNumericBuilder<T>['config']) {
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

export type FirebirdNumericNumberBuilderInitial<TName extends string> = FirebirdNumericNumberBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'FirebirdNumericNumber';
	data: number;
	driverParam: string;
	enumValues: undefined;
}>;

export class FirebirdNumericNumberBuilder<T extends ColumnBuilderBaseConfig<'number', 'FirebirdNumericNumber'>>
	extends FirebirdColumnBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'FirebirdNumericNumberBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'number', 'FirebirdNumericNumber');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdNumericNumber<MakeColumnConfig<T, TTableName>> {
		return new FirebirdNumericNumber<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdNumericNumber<T extends ColumnBaseConfig<'number', 'FirebirdNumericNumber'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdNumericNumber';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyFirebirdTable<{ name: T['tableName'] }>, config: FirebirdNumericNumberBuilder<T>['config']) {
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

export type FirebirdNumericBigIntBuilderInitial<TName extends string> = FirebirdNumericBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'FirebirdNumericBigInt';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class FirebirdNumericBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint', 'FirebirdNumericBigInt'>>
	extends FirebirdColumnBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'FirebirdNumericBigIntBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'bigint', 'FirebirdNumericBigInt');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyFirebirdTable<{ name: TTableName }>,
	): FirebirdNumericBigInt<MakeColumnConfig<T, TTableName>> {
		return new FirebirdNumericBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class FirebirdNumericBigInt<T extends ColumnBaseConfig<'bigint', 'FirebirdNumericBigInt'>> extends FirebirdColumn<T> {
	static override readonly [entityKind]: string = 'FirebirdNumericBigInt';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyFirebirdTable<{ name: T['tableName'] }>, config: FirebirdNumericBigIntBuilder<T>['config']) {
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

export type FirebirdNumericConfig<T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint'> =
	| { precision: number; scale?: number; mode?: T }
	| { precision?: number; scale: number; mode?: T }
	| { precision?: number; scale?: number; mode: T };

export function numeric<TMode extends 'string' | 'number' | 'bigint'>(
	config?: FirebirdNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? FirebirdNumericNumberBuilderInitial<''>
	: Equal<TMode, 'bigint'> extends true ? FirebirdNumericBigIntBuilderInitial<''>
	: FirebirdNumericBuilderInitial<''>;
export function numeric<TName extends string, TMode extends 'string' | 'number' | 'bigint'>(
	name: TName,
	config?: FirebirdNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? FirebirdNumericNumberBuilderInitial<TName>
	: Equal<TMode, 'bigint'> extends true ? FirebirdNumericBigIntBuilderInitial<TName>
	: FirebirdNumericBuilderInitial<TName>;
export function numeric(a?: string | FirebirdNumericConfig, b?: FirebirdNumericConfig) {
	const { name, config } = getColumnNameAndConfig<FirebirdNumericConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new FirebirdNumericNumberBuilder(name, config?.precision, config?.scale)
		: mode === 'bigint'
		? new FirebirdNumericBigIntBuilder(name, config?.precision, config?.scale)
		: new FirebirdNumericBuilder(name, config?.precision, config?.scale);
}

export const decimal = numeric;
