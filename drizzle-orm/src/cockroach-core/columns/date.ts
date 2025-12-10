import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn } from './common.ts';
import { CockroachDateColumnBaseBuilder } from './date.common.ts';

export class CockroachDateBuilder extends CockroachDateColumnBaseBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'CockroachDateBuilder';

	constructor(name: string) {
		super(name, 'object date', 'CockroachDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachDate(
			table,
			this.config,
		);
	}
}

export class CockroachDate<T extends ColumnBaseConfig<'object date'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDate';

	getSQLType(): string {
		return 'date';
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString();
	}
}

export class CockroachDateStringBuilder extends CockroachDateColumnBaseBuilder<{
	dataType: 'string date';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'CockroachDateStringBuilder';

	constructor(name: string) {
		super(name, 'string date', 'CockroachDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachDateString(
			table,
			this.config,
		);
	}
}

export class CockroachDateString<T extends ColumnBaseConfig<'string date'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDateString';

	getSQLType(): string {
		return 'date';
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString();
	}
}

export interface CockroachDateConfig<T extends 'date' | 'string' = 'date' | 'string'> {
	mode: T;
}

export function date<TMode extends CockroachDateConfig['mode'] & {}>(
	config?: CockroachDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? CockroachDateBuilder : CockroachDateStringBuilder;
export function date<TMode extends CockroachDateConfig['mode'] & {}>(
	name: string,
	config?: CockroachDateConfig<TMode>,
): Equal<TMode, 'date'> extends true ? CockroachDateBuilder
	: CockroachDateStringBuilder;
export function date(a?: string | CockroachDateConfig, b?: CockroachDateConfig) {
	const { name, config } = getColumnNameAndConfig<CockroachDateConfig>(a, b);
	if (config?.mode === 'date') {
		return new CockroachDateBuilder(name);
	}
	return new CockroachDateStringBuilder(name);
}
