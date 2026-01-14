import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { PgColumn } from './common.ts';
import { PgDateColumnBuilder } from './date.common.ts';
import type { Precision } from './timestamp.ts';

export class PgTimeBuilder extends PgDateColumnBuilder<
	{
		dataType: 'string time';
		data: string;
		driverParam: string;
	},
	{ withTimezone: boolean; precision: number | undefined }
> {
	static override readonly [entityKind]: string = 'PgTimeBuilder';

	constructor(
		name: string,
		readonly withTimezone: boolean,
		readonly precision: number | undefined,
	) {
		super(name, 'string time', 'PgTime');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgTime(table, this.config as any);
	}
}

export class PgTime extends PgColumn<'string time'> {
	static override readonly [entityKind]: string = 'PgTime';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: PgTable<any>, config: PgTimeBuilder['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `time${precision}${this.withTimezone ? ' with time zone' : ''}`;
	}
}

export interface TimeConfig {
	precision?: Precision;
	withTimezone?: boolean;
}

export function time(config?: TimeConfig): PgTimeBuilder;
export function time(name: string, config?: TimeConfig): PgTimeBuilder;
export function time(a?: string | TimeConfig, b: TimeConfig = {}) {
	const { name, config } = getColumnNameAndConfig<TimeConfig>(a, b);
	return new PgTimeBuilder(name, config.withTimezone ?? false, config.precision);
}
