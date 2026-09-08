import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import { entityKind } from '~/entity.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, type CockroachColumnBaseConfig } from './common.ts';
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

export class CockroachDate<T extends CockroachColumnBaseConfig<'object date'>>
	extends CockroachColumn<'object date', T>
{
	static override readonly [entityKind]: string = 'CockroachDate';

	/** @internal */
	override readonly codec = 'date';

	getSQLType(): string {
		return 'date';
	}

	override mapToDriverValue = (value: Date | string): string => {
		if (typeof value === 'string') return value;
		return value.toISOString();
	};
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

export class CockroachDateString<T extends CockroachColumnBaseConfig<'string date'>>
	extends CockroachColumn<'string date', T>
{
	static override readonly [entityKind]: string = 'CockroachDateString';

	/** @internal */
	override readonly codec = 'date:string';

	getSQLType(): string {
		return 'date';
	}

	override mapToDriverValue = (value: Date | string): string => {
		if (typeof value === 'string') return value;
		return value.toISOString();
	};
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
