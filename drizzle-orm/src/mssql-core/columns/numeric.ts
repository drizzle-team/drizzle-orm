import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlNumericBuilderInitial<TName extends string> = MsSqlNumericBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlNumeric';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class MsSqlNumericBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'MsSqlNumeric'>,
> extends MsSqlColumnBuilderWithIdentity<T, MsSqlNumericConfig> {
	static override readonly [entityKind]: string = 'MsSqlNumericBuilder';

	constructor(name: T['name'], config: MsSqlNumericConfig | undefined) {
		super(name, 'string', 'MsSqlNumeric');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlNumeric<MakeColumnConfig<T, TTableName>> {
		return new MsSqlNumeric<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlNumeric<T extends ColumnBaseConfig<'string', 'MsSqlNumeric'>>
	extends MsSqlColumnWithIdentity<T, MsSqlNumericConfig>
{
	static override readonly [entityKind]: string = 'MsSqlNumeric';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	override mapFromDriverValue(value: unknown): string {
		if (typeof value === 'string') return value;

		return String(value);
	}

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `numeric(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export type MsSqlNumericNumberBuilderInitial<TName extends string> = MsSqlNumericNumberBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlNumericNumber';
	data: number;
	driverParam: string;
	enumValues: undefined;
}>;

export class MsSqlNumericNumberBuilder<
	T extends ColumnBuilderBaseConfig<'number', 'MsSqlNumericNumber'>,
> extends MsSqlColumnBuilderWithIdentity<T, MsSqlNumericConfig> {
	static override readonly [entityKind]: string = 'MsSqlNumericNumberBuilder';

	constructor(name: T['name'], config: MsSqlNumericConfig | undefined) {
		super(name, 'number', 'MsSqlNumericNumber');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlNumericNumber<MakeColumnConfig<T, TTableName>> {
		return new MsSqlNumericNumber<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlNumericNumber<T extends ColumnBaseConfig<'number', 'MsSqlNumericNumber'>>
	extends MsSqlColumnWithIdentity<T, MsSqlNumericConfig>
{
	static override readonly [entityKind]: string = 'MsSqlNumericNumber';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	override mapFromDriverValue(value: unknown): number {
		if (typeof value === 'number') return value;

		return Number(value);
	}

	override mapToDriverValue = String;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `numeric(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export type MsSqlNumericBigIntBuilderInitial<TName extends string> = MsSqlNumericBigIntBuilder<{
	name: TName;
	dataType: 'bigint';
	columnType: 'MsSqlNumericBigInt';
	data: bigint;
	driverParam: string;
	enumValues: undefined;
}>;

export class MsSqlNumericBigIntBuilder<
	T extends ColumnBuilderBaseConfig<'bigint', 'MsSqlNumericBigInt'>,
> extends MsSqlColumnBuilderWithIdentity<T, MsSqlNumericConfig> {
	static override readonly [entityKind]: string = 'MsSqlNumericBigIntBuilder';

	constructor(name: T['name'], config: MsSqlNumericConfig | undefined) {
		super(name, 'bigint', 'MsSqlNumericBigInt');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlNumericBigInt<MakeColumnConfig<T, TTableName>> {
		return new MsSqlNumericBigInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlNumericBigInt<T extends ColumnBaseConfig<'bigint', 'MsSqlNumericBigInt'>>
	extends MsSqlColumnWithIdentity<T, MsSqlNumericConfig>
{
	static override readonly [entityKind]: string = 'MsSqlNumericBigInt';

	readonly precision: number | undefined = this.config.precision;
	readonly scale: number | undefined = this.config.scale;

	override mapFromDriverValue = BigInt;

	override mapToDriverValue = String;

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `numeric(${this.precision},${this.scale})`;
		} else if (this.precision === undefined) {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}
}

export interface MsSqlNumericConfig<T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint'> {
	precision?: number;
	scale?: number;
	mode?: T;
}

export function numeric(): MsSqlNumericBuilderInitial<''>;
export function numeric<TMode extends 'string' | 'number' | 'bigint'>(
	config: MsSqlNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MsSqlNumericNumberBuilderInitial<''>
	: Equal<TMode, 'bigint'> extends true ? MsSqlNumericBigIntBuilderInitial<''>
	: MsSqlNumericBuilderInitial<''>;
export function numeric<TName extends string, TMode extends 'string' | 'number' | 'bigint'>(
	name: TName,
	config?: MsSqlNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MsSqlNumericNumberBuilderInitial<TName>
	: Equal<TMode, 'bigint'> extends true ? MsSqlNumericBigIntBuilderInitial<TName>
	: MsSqlNumericBuilderInitial<TName>;
export function numeric(a?: string | MsSqlNumericConfig, b?: MsSqlNumericConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlNumericConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new MsSqlNumericNumberBuilder(name, config)
		: mode === 'bigint'
		? new MsSqlNumericBigIntBuilder(name, config)
		: new MsSqlNumericBuilder(name, config);
}
