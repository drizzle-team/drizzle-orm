import type { GeneratedColumnConfig, HasGenerated } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable, SingleStoreTable } from '~/singlestore-core/table.ts';
import type { SQL } from '~/sql/sql.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder, type SingleStoreGeneratedColumnConfig } from './common.ts';

export class SingleStoreDateTimeBuilder extends SingleStoreColumnBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string | number;
}, SingleStoreDatetimeConfig> {
	// TODO: we need to add a proper support for SingleStore
	override generatedAlwaysAs(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		as: SQL | (() => SQL) | this['_']['data'],
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		config?: SingleStoreGeneratedColumnConfig,
	): HasGenerated<this, { type: 'always' }> {
		throw new Error('Method not implemented.');
	}
	static override readonly [entityKind]: string = 'SingleStoreDateTimeBuilder';

	constructor(name: string) {
		super(name, 'object date', 'SingleStoreDateTime');
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreDateTime(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreDateTime<T extends ColumnBaseConfig<'object date'>> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreDateTime';

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreDateTimeBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `datetime`;
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString().replace('T', ' ').replace('Z', '');
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value.replace(' ', 'T') + 'Z');
	}
}

export class SingleStoreDateTimeStringBuilder extends SingleStoreColumnBuilder<{
	dataType: 'string datetime';
	data: string;
	driverParam: string | number;
}, SingleStoreDatetimeConfig> {
	// TODO: we need to add a proper support for SingleStore
	override generatedAlwaysAs(
		_as: SQL | (() => SQL) | this['_']['data'],
		_config?: Partial<GeneratedColumnConfig<unknown>>,
	): HasGenerated<this, { type: 'always' }> {
		throw new Error('Method not implemented.');
	}
	static override readonly [entityKind]: string = 'SingleStoreDateTimeStringBuilder';

	constructor(name: string) {
		super(name, 'string datetime', 'SingleStoreDateTimeString');
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreDateTimeString(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreDateTimeString<T extends ColumnBaseConfig<'string datetime'>> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreDateTimeString';

	constructor(
		table: AnySingleStoreTable<{ name: T['tableName'] }>,
		config: SingleStoreDateTimeStringBuilder['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `datetime`;
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString().replace('T', ' ').replace('Z', '');
	}
}

export interface SingleStoreDatetimeConfig<TMode extends 'date' | 'string' = 'date' | 'string'> {
	mode?: TMode;
}

export function datetime<TMode extends SingleStoreDatetimeConfig['mode'] & {}>(
	config?: SingleStoreDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreDateTimeStringBuilder
	: SingleStoreDateTimeBuilder;
export function datetime<TMode extends SingleStoreDatetimeConfig['mode'] & {}>(
	name: string,
	config?: SingleStoreDatetimeConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreDateTimeStringBuilder
	: SingleStoreDateTimeBuilder;
export function datetime(a?: string | SingleStoreDatetimeConfig, b?: SingleStoreDatetimeConfig) {
	const { name, config } = getColumnNameAndConfig<SingleStoreDatetimeConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new SingleStoreDateTimeStringBuilder(name);
	}
	return new SingleStoreDateTimeBuilder(name);
}
