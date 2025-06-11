import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';

export type CockroachDbNumericBuilderInitial<TName extends string> = CockroachDbNumericBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachDbNumeric';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbNumericBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachDbNumeric'>>
	extends CockroachDbColumnWithArrayBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'CockroachDbNumericBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'string', 'CockroachDbNumeric');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbNumeric<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbNumeric<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbNumeric<T extends ColumnBaseConfig<'string', 'CockroachDbNumeric'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbNumeric';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: AnyCockroachDbTable<{ name: T['tableName'] }>, config: CockroachDbNumericBuilder<T>['config']) {
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

export type CockroachDbNumericNumberBuilderInitial<TName extends string> = CockroachDbNumericNumberBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'CockroachDbNumericNumber';
	data: number;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbNumericNumberBuilder<T extends ColumnBuilderBaseConfig<'number', 'CockroachDbNumericNumber'>>
	extends CockroachDbColumnWithArrayBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'CockroachDbNumericNumberBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'number', 'CockroachDbNumericNumber');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbNumericNumber<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbNumericNumber<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbNumericNumber<T extends ColumnBaseConfig<'number', 'CockroachDbNumericNumber'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbNumericNumber';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(
		table: AnyCockroachDbTable<{ name: T['tableName'] }>,
		config: CockroachDbNumericNumberBuilder<T>['config'],
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

export type CockroachDbNumericBigIntBuilderInitial<TName extends string> = CockroachDbNumericBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'CockroachDbNumericBigInt';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbNumericBigIntBuilder<T extends ColumnBuilderBaseConfig<'bigint', 'CockroachDbNumericBigInt'>>
	extends CockroachDbColumnWithArrayBuilder<
		T,
		{
			precision: number | undefined;
			scale: number | undefined;
		}
	>
{
	static override readonly [entityKind]: string = 'CockroachDbNumericBigIntBuilder';

	constructor(name: T['name'], precision?: number, scale?: number) {
		super(name, 'bigint', 'CockroachDbNumericBigInt');
		this.config.precision = precision;
		this.config.scale = scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbNumericBigInt<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbNumericBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbNumericBigInt<T extends ColumnBaseConfig<'bigint', 'CockroachDbNumericBigInt'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbNumericBigInt';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(
		table: AnyCockroachDbTable<{ name: T['tableName'] }>,
		config: CockroachDbNumericBigIntBuilder<T>['config'],
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

export type CockroachDbNumericConfig<T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint'> =
	| { precision: number; scale?: number; mode?: T }
	| { precision?: number; scale: number; mode?: T }
	| { precision?: number; scale?: number; mode: T };

export function numeric<TMode extends 'string' | 'number' | 'bigint'>(
	config?: CockroachDbNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? CockroachDbNumericNumberBuilderInitial<''>
	: Equal<TMode, 'bigint'> extends true ? CockroachDbNumericBigIntBuilderInitial<''>
	: CockroachDbNumericBuilderInitial<''>;
export function numeric<TName extends string, TMode extends 'string' | 'number' | 'bigint'>(
	name: TName,
	config?: CockroachDbNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? CockroachDbNumericNumberBuilderInitial<TName>
	: Equal<TMode, 'bigint'> extends true ? CockroachDbNumericBigIntBuilderInitial<TName>
	: CockroachDbNumericBuilderInitial<TName>;
export function numeric(a?: string | CockroachDbNumericConfig, b?: CockroachDbNumericConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachDbNumericConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new CockroachDbNumericNumberBuilder(name, config?.precision, config?.scale)
		: mode === 'bigint'
		? new CockroachDbNumericBigIntBuilder(name, config?.precision, config?.scale)
		: new CockroachDbNumericBuilder(name, config?.precision, config?.scale);
}

export const decimal = numeric;
