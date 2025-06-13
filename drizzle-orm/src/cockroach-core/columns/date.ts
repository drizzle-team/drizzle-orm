import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn } from './common.ts';
import { CockroachDateColumnBaseBuilder } from './date.common.ts';

export type CockroachDateBuilderInitial<TName extends string> = CockroachDateBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'CockroachDate';
	data: Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'CockroachDate'>>
	extends CockroachDateColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDateBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'CockroachDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachDate<MakeColumnConfig<T, TTableName>> {
		return new CockroachDate<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDate<T extends ColumnBaseConfig<'date', 'CockroachDate'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDate';

	getSQLType(): string {
		return 'date';
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString();
	}
}

export type CockroachDateStringBuilderInitial<TName extends string> = CockroachDateStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachDateString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDateStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachDateString'>>
	extends CockroachDateColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDateStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'CockroachDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachDateString<MakeColumnConfig<T, TTableName>> {
		return new CockroachDateString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDateString<T extends ColumnBaseConfig<'string', 'CockroachDateString'>>
	extends CockroachColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDateString';

	getSQLType(): string {
		return 'date';
	}
}

export interface CockroachDateConfig<T extends 'date' | 'string' = 'date' | 'string'> {
	mode: T;
}

export function date(): CockroachDateStringBuilderInitial<''>;
export function date<TMode extends CockroachDateConfig['mode'] & {}>(
	config?: CockroachDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? CockroachDateBuilderInitial<''> : CockroachDateStringBuilderInitial<''>;
export function date<TName extends string, TMode extends CockroachDateConfig['mode'] & {}>(
	name: TName,
	config?: CockroachDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? CockroachDateBuilderInitial<TName>
	: CockroachDateStringBuilderInitial<TName>;
export function date(a?: string | CockroachDateConfig, b?: CockroachDateConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachDateConfig>(a, b);
	if (config?.mode === 'date') {
		return new CockroachDateBuilder(name);
	}
	return new CockroachDateStringBuilder(name);
}
