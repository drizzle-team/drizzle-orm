import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachDbColumn } from './common.ts';
import { CockroachDbDateColumnBaseBuilder } from './date.common.ts';

export type CockroachDbDateBuilderInitial<TName extends string> = CockroachDbDateBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'CockroachDbDate';
	data: Date;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'CockroachDbDate'>>
	extends CockroachDbDateColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbDateBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'CockroachDbDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbDate<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbDate<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbDate<T extends ColumnBaseConfig<'date', 'CockroachDbDate'>> extends CockroachDbColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDbDate';

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

export type CockroachDbDateStringBuilderInitial<TName extends string> = CockroachDbDateStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'CockroachDbDateString';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class CockroachDbDateStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'CockroachDbDateString'>>
	extends CockroachDbDateColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbDateStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'CockroachDbDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbDateString<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbDateString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbDateString<T extends ColumnBaseConfig<'string', 'CockroachDbDateString'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbDateString';

	getSQLType(): string {
		return 'date';
	}
}

export interface CockroachDbDateConfig<T extends 'date' | 'string' = 'date' | 'string'> {
	mode: T;
}

export function date(): CockroachDbDateStringBuilderInitial<''>;
export function date<TMode extends CockroachDbDateConfig['mode'] & {}>(
	config?: CockroachDbDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? CockroachDbDateBuilderInitial<''> : CockroachDbDateStringBuilderInitial<''>;
export function date<TName extends string, TMode extends CockroachDbDateConfig['mode'] & {}>(
	name: TName,
	config?: CockroachDbDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? CockroachDbDateBuilderInitial<TName>
	: CockroachDbDateStringBuilderInitial<TName>;
export function date(a?: string | CockroachDbDateConfig, b?: CockroachDbDateConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachDbDateConfig>(a, b);
	if (config?.mode === 'date') {
		return new CockroachDbDateBuilder(name);
	}
	return new CockroachDbDateStringBuilder(name);
}
