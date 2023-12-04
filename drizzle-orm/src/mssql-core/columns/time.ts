import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export type MsSqlTimeBuilderInitial<TName extends string> = MsSqlTimeBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'MsSqlTime';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class MsSqlTimeBuilder<T extends ColumnBuilderBaseConfig<'string', 'MsSqlTime'>> extends MsSqlColumnBuilder<
	T,
	TimeConfig
> {
	static readonly [entityKind]: string = 'MsSqlTimeBuilder';

	constructor(
		name: T['name'],
		config: TimeConfig | undefined,
	) {
		super(name, 'string', 'MsSqlTime');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlTime<MakeColumnConfig<T, TTableName>> {
		return new MsSqlTime<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlTime<
	T extends ColumnBaseConfig<'string', 'MsSqlTime'>,
> extends MsSqlColumn<T, TimeConfig> {
	static readonly [entityKind]: string = 'MsSqlTime';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `time${precision}`;
	}
}

export type TimeConfig = {
	fsp?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export function time<TName extends string>(name: TName, config?: TimeConfig): MsSqlTimeBuilderInitial<TName> {
	return new MsSqlTimeBuilder(name, config);
}
