import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn } from './common.ts';
import { DSQLDateColumnBuilder } from './date.common.ts';

export interface DSQLTimestampConfig {
	precision?: number;
	withTimezone?: boolean;
}

export class DSQLTimestampBuilder extends DSQLDateColumnBuilder<
	{
		dataType: 'date';
		data: Date;
		driverParam: string;
	},
	{ withTimezone: boolean; precision: number | undefined }
> {
	static override readonly [entityKind]: string = 'DSQLTimestampBuilder';

	constructor(name: string, withTimezone: boolean, precision: number | undefined) {
		super(name, 'date', 'DSQLTimestamp');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build(table: DSQLTable): DSQLTimestamp {
		return new DSQLTimestamp(table, this.config as any);
	}
}

export class DSQLTimestamp extends DSQLColumn<'date'> {
	static override readonly [entityKind]: string = 'DSQLTimestamp';

	readonly precision: number | undefined;
	readonly withTimezone: boolean;

	constructor(table: DSQLTable, config: DSQLTimestampBuilder['config']) {
		super(table, config);
		this.precision = config.precision;
		this.withTimezone = config.withTimezone;
	}

	getSQLType(): string {
		const precision = this.precision !== undefined ? `(${this.precision})` : '';
		return this.withTimezone ? `timestamp${precision} with time zone` : `timestamp${precision}`;
	}

	override mapFromDriverValue(value: Date | string): Date {
		if (typeof value === 'string') return new Date(this.withTimezone ? value : value + '+0000');
		return value;
	}

	override mapToDriverValue(value: Date | string): string {
		if (typeof value === 'string') return value;
		return value.toISOString();
	}
}

export function timestamp(name?: string, config?: DSQLTimestampConfig): DSQLTimestampBuilder {
	return new DSQLTimestampBuilder(name ?? '', config?.withTimezone ?? false, config?.precision);
}
