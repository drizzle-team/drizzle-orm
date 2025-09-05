import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable, SingleStoreTable } from '~/singlestore-core/table.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreDateBuilder extends SingleStoreColumnBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string | number;
}> {
	static override readonly [entityKind]: string = 'SingleStoreDateBuilder';

	constructor(name: string) {
		super(name, 'object date', 'SingleStoreDate');
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreDate(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreDate<T extends ColumnBaseConfig<'object date'>> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreDate';

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreDateBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}
}

export class SingleStoreDateStringBuilder extends SingleStoreColumnBuilder<{
	dataType: 'string date';
	data: string;
	driverParam: string | number;
}> {
	static override readonly [entityKind]: string = 'SingleStoreDateStringBuilder';

	constructor(name: string) {
		super(name, 'string date', 'SingleStoreDateString');
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreDateString(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreDateString<T extends ColumnBaseConfig<'string date'>> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreDateString';

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreDateStringBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}
}

export interface SingleStoreDateConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
}

export function date<TMode extends SingleStoreDateConfig['mode'] & {}>(
	config?: SingleStoreDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreDateStringBuilder : SingleStoreDateBuilder;
export function date<TMode extends SingleStoreDateConfig['mode'] & {}>(
	name: string,
	config?: SingleStoreDateConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreDateStringBuilder
	: SingleStoreDateBuilder;
export function date(a?: string | SingleStoreDateConfig, b?: SingleStoreDateConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreDateConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new SingleStoreDateStringBuilder(name);
	}
	return new SingleStoreDateBuilder(name);
}
