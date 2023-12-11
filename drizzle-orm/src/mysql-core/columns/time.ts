import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlTimeBuilderInitial<TName extends string> = MySqlTimeBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'MySqlTime';
		data: string;
		driverParam: string | number;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class MySqlTimeBuilder<T extends ColumnBuilderBaseConfig<'string', 'MySqlTime'>> extends MySqlColumnBuilder<
	T,
	TimeConfig
> {
	static readonly [entityKind]: string = 'MySqlTimeBuilder';

	constructor(
		name: T['name'],
		config: TimeConfig | undefined,
	) {
		super(name, 'string', 'MySqlTime');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlTime<MakeColumnConfig<T, TTableName>> {
		return new MySqlTime<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MySqlTime<
	T extends ColumnBaseConfig<'string', 'MySqlTime'>,
> extends MySqlColumn<T, TimeConfig> {
	static readonly [entityKind]: string = 'MySqlTime';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `time${precision}`;
	}
}

export type TimeConfig = {
	fsp?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export function time<TName extends string>(name: TName, config?: TimeConfig): MySqlTimeBuilderInitial<TName> {
	return new MySqlTimeBuilder(name, config);
}
