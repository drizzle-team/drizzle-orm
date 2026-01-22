import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export interface DSQLTimestampConfig {
	precision?: number;
	withTimezone?: boolean;
}

export class DSQLTimestampBuilder extends DSQLColumnBuilder<{
	dataType: 'date';
	data: Date;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLTimestampBuilder';

	constructor(name: string, private config: DSQLTimestampConfig = {}) {
		super(name, 'date', 'DSQLTimestamp');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLTimestamp {
		throw new Error('Method not implemented.');
	}
}

export class DSQLTimestamp extends DSQLColumn<'date'> {
	static override readonly [entityKind]: string = 'DSQLTimestamp';

	readonly precision: number | undefined;
	readonly withTimezone: boolean;

	constructor(table: DSQLTable, config: any) {
		super(table, config);
		this.precision = config.precision;
		this.withTimezone = config.withTimezone ?? false;
	}

	getSQLType(): string {
		const precision = this.precision !== undefined ? `(${this.precision})` : '';
		return this.withTimezone ? `timestamp${precision} with time zone` : `timestamp${precision}`;
	}

	override mapFromDriverValue(value: string): Date {
		throw new Error('Method not implemented.');
	}

	override mapToDriverValue(value: Date): string {
		throw new Error('Method not implemented.');
	}
}

export function timestamp(name?: string, config?: DSQLTimestampConfig): DSQLTimestampBuilder {
	return new DSQLTimestampBuilder(name ?? '', config);
}
