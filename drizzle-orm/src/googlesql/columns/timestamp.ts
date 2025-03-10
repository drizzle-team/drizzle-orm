import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlTimestampBuilderInitial<TName extends string> = GoogleSqlTimestampBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'GoogleSqlTimestamp';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class GoogleSqlTimestampBuilder<T extends ColumnBuilderBaseConfig<'date', 'GoogleSqlTimestamp'>>
	extends GoogleSqlColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlTimestampBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'GoogleSqlTimestamp');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlTimestamp<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

// TODO: SPANNER - verify how values are mapped to and from the driver
export class GoogleSqlTimestamp<T extends ColumnBaseConfig<'date', 'GoogleSqlTimestamp'>>
	extends GoogleSqlColumn<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlTimestamp';

	getSQLType(): string {
		return `timestamp`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value + '+0000');
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString().slice(0, -1).replace('T', ' ');
	}
}

// TODO: SPANNER - add support for allowCommitTimestamp https://cloud.google.com/spanner/docs/commit-timestamp#overview
// export interface GoogleSqlTimestampConfig<AllowAC extends boolean> {
// 	allowCommitTimestamp?: AllowAC;
// }

export function timestamp(): GoogleSqlTimestampBuilderInitial<''>;
export function timestamp<TName extends string>(
	name: TName,
): GoogleSqlTimestampBuilderInitial<TName>;
export function timestamp(name?: string) {
	return new GoogleSqlTimestampBuilder(name ?? '');
}
