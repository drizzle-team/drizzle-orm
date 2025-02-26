import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlTimeBuilderInitial<TName extends string> = GoogleSqlTimeBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GoogleSqlTime';
	data: string;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class GoogleSqlTimeBuilder<T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlTime'>> extends GoogleSqlColumnBuilder<
	T,
	TimeConfig
> {
	static override readonly [entityKind]: string = 'GoogleSqlTimeBuilder';

	constructor(
		name: T['name'],
		config: TimeConfig | undefined,
	) {
		super(name, 'string', 'GoogleSqlTime');
		this.config.fsp = config?.fsp;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlTime<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlTime<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class GoogleSqlTime<
	T extends ColumnBaseConfig<'string', 'GoogleSqlTime'>,
> extends GoogleSqlColumn<T, TimeConfig> {
	static override readonly [entityKind]: string = 'GoogleSqlTime';

	readonly fsp: number | undefined = this.config.fsp;

	getSQLType(): string {
		const precision = this.fsp === undefined ? '' : `(${this.fsp})`;
		return `time${precision}`;
	}
}

export type TimeConfig = {
	fsp?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
};

export function time(): GoogleSqlTimeBuilderInitial<''>;
export function time(
	config?: TimeConfig,
): GoogleSqlTimeBuilderInitial<''>;
export function time<TName extends string>(
	name: TName,
	config?: TimeConfig,
): GoogleSqlTimeBuilderInitial<TName>;
export function time(a?: string | TimeConfig, b?: TimeConfig) {
	const { name, config } = getColumnNameAndConfig<TimeConfig>(a, b);
	return new GoogleSqlTimeBuilder(name, config);
}
