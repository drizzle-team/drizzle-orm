import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export class MsSqlNumericBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'string numeric';
	data: string;
	driverParam: string;
}, MsSqlNumericConfig> {
	static override readonly [entityKind]: string = 'MsSqlNumericBuilder';

	constructor(name: string, config: MsSqlNumericConfig | undefined) {
		super(name, 'string numeric', 'MsSqlNumeric');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlNumeric(
			table,
			this.config,
		);
	}
}

export class MsSqlNumeric<T extends ColumnBaseConfig<'string numeric'>>
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

export class MsSqlNumericNumberBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'number';
	data: number;
	driverParam: string;
}, MsSqlNumericConfig> {
	static override readonly [entityKind]: string = 'MsSqlNumericNumberBuilder';

	constructor(name: string, config: MsSqlNumericConfig | undefined) {
		super(name, 'number', 'MsSqlNumericNumber');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlNumericNumber(
			table,
			this.config,
		);
	}
}

export class MsSqlNumericNumber<T extends ColumnBaseConfig<'number'>>
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

export class MsSqlNumericBigIntBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'bigint int64';
	data: bigint;
	driverParam: string;
}, MsSqlNumericConfig> {
	static override readonly [entityKind]: string = 'MsSqlNumericBigIntBuilder';

	constructor(name: string, config: MsSqlNumericConfig | undefined) {
		super(name, 'bigint int64', 'MsSqlNumericBigInt');
		this.config.precision = config?.precision;
		this.config.scale = config?.scale;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlNumericBigInt(
			table,
			this.config,
		);
	}
}

export class MsSqlNumericBigInt<T extends ColumnBaseConfig<'bigint int64'>>
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

export interface MsSqlNumericConfig<
	T extends 'string' | 'number' | 'bigint' = 'string' | 'number' | 'bigint',
> {
	precision?: number;
	scale?: number;
	mode?: T;
}

export function numeric<TMode extends 'string' | 'number' | 'bigint'>(
	config?: MsSqlNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MsSqlNumericNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? MsSqlNumericBigIntBuilder
	: MsSqlNumericBuilder;
export function numeric<TMode extends 'string' | 'number' | 'bigint'>(
	name: string,
	config?: MsSqlNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? MsSqlNumericNumberBuilder
	: Equal<TMode, 'bigint'> extends true ? MsSqlNumericBigIntBuilder
	: MsSqlNumericBuilder;
export function numeric(a?: string | MsSqlNumericConfig, b?: MsSqlNumericConfig) {
	const { name, config } = getColumnNameAndConfig<MsSqlNumericConfig>(a, b);
	const mode = config?.mode;
	return mode === 'number'
		? new MsSqlNumericNumberBuilder(name, config)
		: mode === 'bigint'
		? new MsSqlNumericBigIntBuilder(name, config)
		: new MsSqlNumericBuilder(name, config);
}
