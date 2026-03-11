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

	constructor(name: string, private timeConfig: DSQLTimeConfig = {}) {
		super(name, 'string', 'DSQLTime');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLTime {
		return new DSQLTime(
			table,
			{ ...this.config, precision: this.timeConfig.precision, withTimezone: this.timeConfig.withTimezone } as any,
		);
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

	override getSQLType(): string {
		const precision = this.precision !== undefined ? `(${this.precision})` : '';
		return this.withTimezone ? `time${precision} with time zone` : `time${precision}`;
	}
}

export function time(name?: string, config?: DSQLTimeConfig): DSQLTimeBuilder {
	return new DSQLTimeBuilder(name ?? '', config);
}
