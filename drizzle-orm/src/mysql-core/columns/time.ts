import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export class MySqlTimeBuilder extends MySqlColumnBuilder<
	{
		name: string;
		dataType: 'string';
		data: string;
		driverParam: string | number;
		enumValues: undefined;
	},
	TimeConfig
> {
	static override readonly [entityKind]: string = 'MySqlTimeBuilder';

	constructor(
		name: string,
		config: TimeConfig | undefined,
	) {
		super(name, 'string', 'MySqlTime');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlTime(table, this.config as any);
	}
}

export class MySqlTime<
	T extends ColumnBaseConfig<'string'>,
> extends MySqlColumn<T, TimeConfig> {
	static override readonly [entityKind]: string = 'MySqlTime';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `time${precision}`;
	}
}

export type TimeConfig = {
	fsp?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export function time(
	config?: TimeConfig,
): MySqlTimeBuilder;
export function time(
	name: string,
	config?: TimeConfig,
): MySqlTimeBuilder;
export function time(a?: string | TimeConfig, b?: TimeConfig) {
	const { name, config } = getColumnNameAndConfig<TimeConfig>(a, b);
	return new MySqlTimeBuilder(name, config);
}
