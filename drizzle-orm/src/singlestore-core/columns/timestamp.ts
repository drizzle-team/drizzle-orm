import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { sql } from '~/sql/sql.ts';
import { type Equal, getColumnNameAndConfig } from '~/utils.ts';
import { SingleStoreDateBaseColumn, SingleStoreDateColumnBaseBuilder } from './date.common.ts';

export class SingleStoreTimestampBuilder extends SingleStoreDateColumnBaseBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string | number;
}, SingleStoreTimestampConfig> {
	static override readonly [entityKind]: string = 'SingleStoreTimestampBuilder';

	constructor(name: string) {
		super(name, 'object date', 'SingleStoreTimestamp');
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreTimestamp(
			table,
			this.config as any,
		);
	}

	override defaultNow() {
		return this.default(sql`CURRENT_TIMESTAMP`);
	}
}

export class SingleStoreTimestamp<T extends ColumnBaseConfig<'object date'>>
	extends SingleStoreDateBaseColumn<T, SingleStoreTimestampConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreTimestamp';

	getSQLType(): string {
		return `timestamp`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value + '+0000');
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString().slice(0, -1).replace('T', ' ');
	}
}

export class SingleStoreTimestampStringBuilder extends SingleStoreDateColumnBaseBuilder<{
	dataType: 'string timestamp';
	data: string;
	driverParam: string | number;
}, SingleStoreTimestampConfig> {
	static override readonly [entityKind]: string = 'SingleStoreTimestampStringBuilder';

	constructor(name: string) {
		super(name, 'string timestamp', 'SingleStoreTimestampString');
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreTimestampString(
			table,
			this.config as any,
		);
	}

	override defaultNow() {
		return this.default(sql`CURRENT_TIMESTAMP`);
	}
}

export class SingleStoreTimestampString<T extends ColumnBaseConfig<'string timestamp'>>
	extends SingleStoreDateBaseColumn<T, SingleStoreTimestampConfig>
{
	static override readonly [entityKind]: string = 'SingleStoreTimestampString';

	getSQLType(): string {
		return `timestamp`;
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString().slice(0, -1).replace('T', ' ');
	}
}

export interface SingleStoreTimestampConfig<TMode extends 'string' | 'date' = 'string' | 'date'> {
	mode?: TMode;
}

export function timestamp<TMode extends SingleStoreTimestampConfig['mode'] & {}>(
	config?: SingleStoreTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreTimestampStringBuilder
	: SingleStoreTimestampBuilder;
export function timestamp<TMode extends SingleStoreTimestampConfig['mode'] & {}>(
	name: string,
	config?: SingleStoreTimestampConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreTimestampStringBuilder
	: SingleStoreTimestampBuilder;
export function timestamp(a?: string | SingleStoreTimestampConfig, b: SingleStoreTimestampConfig = {}) {
	const { name, config } = getColumnNameAndConfig<SingleStoreTimestampConfig | undefined>(a, b);
	if (config?.mode === 'string') {
		return new SingleStoreTimestampStringBuilder(name);
	}
	return new SingleStoreTimestampBuilder(name);
}
