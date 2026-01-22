import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export interface DSQLTimeConfig {
	precision?: number;
	withTimezone?: boolean;
}

export class DSQLTimeBuilder extends DSQLColumnBuilder<{
	dataType: 'string';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLTimeBuilder';

	constructor(name: string, private config: DSQLTimeConfig = {}) {
		super(name, 'string', 'DSQLTime');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLTime {
		throw new Error('Method not implemented.');
	}
}

export class DSQLTime extends DSQLColumn<'string'> {
	static override readonly [entityKind]: string = 'DSQLTime';

	readonly precision: number | undefined;
	readonly withTimezone: boolean;

	constructor(table: DSQLTable, config: any) {
		super(table, config);
		this.precision = config.precision;
		this.withTimezone = config.withTimezone ?? false;
	}

	getSQLType(): string {
		const precision = this.precision !== undefined ? `(${this.precision})` : '';
		return this.withTimezone ? `time${precision} with time zone` : `time${precision}`;
	}
}

export function time(name?: string, config?: DSQLTimeConfig): DSQLTimeBuilder {
	return new DSQLTimeBuilder(name ?? '', config);
}
