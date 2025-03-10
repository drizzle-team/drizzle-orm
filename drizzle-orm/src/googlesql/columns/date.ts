import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlDateBuilderInitial<TName extends string> = GoogleSqlDateBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'GoogleSqlDate';
	data: Date;
	driverParam: string | number;
	enumValues: undefined;
}>;

export class GoogleSqlDateBuilder<T extends ColumnBuilderBaseConfig<'date', 'GoogleSqlDate'>>
	extends GoogleSqlColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlDateBuilder';

	constructor(name: T['name']) {
		super(name, 'date', 'GoogleSqlDate');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlDate<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlDate<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}


// TODO: SPANNER - check how values are mapped to and from the driver
export class GoogleSqlDate<T extends ColumnBaseConfig<'date', 'GoogleSqlDate'>> extends GoogleSqlColumn<T> {
	static override readonly [entityKind]: string = 'GoogleSqlDate';

	constructor(
		table: AnyGoogleSqlTable<{ name: T['tableName'] }>,
		config: GoogleSqlDateBuilder<T>['config'],
	) {
		super(table, config);
	}

	getSQLType(): string {
		return `date`;
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value);
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString().split('T')[0]!;
	}
}

export function date(): GoogleSqlDateBuilderInitial<''>;
export function date<TName extends string>(
	name: TName
): GoogleSqlDateBuilderInitial<TName>;
export function date(name?: string) {
	return new GoogleSqlDateBuilder(name ?? '');
}
