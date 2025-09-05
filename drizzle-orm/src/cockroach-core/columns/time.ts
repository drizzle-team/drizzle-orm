import type { AnyCockroachTable, CockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';
import type { Precision } from './timestamp.ts';

export class CockroachTimeBuilder extends CockroachColumnWithArrayBuilder<
	{
		dataType: 'string time';
		data: string;
		driverParam: string;
	},
	{ withTimezone: boolean; precision: number | undefined }
> {
	static override readonly [entityKind]: string = 'CockroachTimeBuilder';

	constructor(
		name: string,
		readonly withTimezone: boolean,
		readonly precision: number | undefined,
	) {
		super(name, 'string time', 'CockroachTime');
		this.config.withTimezone = withTimezone;
		this.config.precision = precision;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachTime(
			table,
			this.config,
		);
	}
}

export class CockroachTime<T extends ColumnBaseConfig<'string time'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachTime';

	readonly withTimezone: boolean;
	readonly precision: number | undefined;

	constructor(table: CockroachTable<any>, config: CockroachTimeBuilder['config']) {
		super(table, config);
		this.withTimezone = config.withTimezone;
		this.precision = config.precision;
	}

	getSQLType(): string {
		const precision = this.precision === undefined ? '' : `(${this.precision})`;
		return `time${this.withTimezone ? 'tz' : ''}${precision}`;
	}
}

export interface TimeConfig {
	precision?: Precision;
	withTimezone?: boolean;
}

export function time(config?: TimeConfig): CockroachTimeBuilder;
export function time(name: string, config?: TimeConfig): CockroachTimeBuilder;
export function time(a?: string | TimeConfig, b: TimeConfig = {}) {
	const { name, config } = getColumnNameAndConfig<TimeConfig>(a, b);
	return new CockroachTimeBuilder(name, config.withTimezone ?? false, config.precision);
}
