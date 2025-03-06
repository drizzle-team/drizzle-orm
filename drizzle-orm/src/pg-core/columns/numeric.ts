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
	generated: undefined;
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

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `numeric(${this.precision}, ${this.scale})`;
		} else if (this.precision === undefined) {
			return 'numeric';
		} else {
			return `numeric(${this.precision})`;
		}
	}

	// eslint-disable-next-line unicorn/prefer-native-coercion-functions
	override mapFromDriverValue(value: string): number {
		return Number(value);
	}

	override mapToDriverValue(value: number): string {
		return value.toString();
	}
}

export type PgNumericConfig<TMode extends 'number' | 'string' = 'number' | 'string'> =
	& {
		mode?: TMode;
	}
	& (
		| { precision: number; scale?: number }
		| { precision?: number; scale?: undefined }
	);

export function numeric(): PgNumericBuilderInitial<''>;
export function numeric<TMode extends PgNumericConfig['mode'] & {}>(
	config?: PgNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? PgNumericNumberBuilderInitial<''> : PgNumericBuilderInitial<''>;

export function numeric<TName extends string, TMode extends PgNumericConfig['mode'] & {}>(
	name: TName,
	config?: PgNumericConfig<TMode>,
): Equal<TMode, 'number'> extends true ? PgNumericNumberBuilderInitial<TName> : PgNumericBuilderInitial<TName>;
export function numeric(a?: string | PgNumericConfig, b?: PgNumericConfig) {
	const { name, config } = getColumnNameAndConfig<PgNumericConfig>(a, b);
	if (config?.mode === 'number') {
		return new PgNumericNumberBuilder(name, config?.precision, config?.scale);
	}
	return new PgNumericBuilder(name, config?.precision, config?.scale);
}

export const decimal = numeric;
