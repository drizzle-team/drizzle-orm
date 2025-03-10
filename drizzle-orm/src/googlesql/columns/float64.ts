import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { GoogleSqlColumnBuilder, GoogleSqlColumn } from './common.ts';

export type GoogleSqlFloat64BuilderInitial<TName extends string> = GoogleSqlFloat64Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlFloat64';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class GoogleSqlFloat64Builder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlFloat64'>>
	extends GoogleSqlColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlFloat64Builder';

	constructor(name: T['name']) {
		super(name, 'number', 'GoogleSqlFloat64');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlFloat64<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlFloat64<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlFloat64<T extends ColumnBaseConfig<'number', 'GoogleSqlFloat64'>>
	extends GoogleSqlColumn<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlFloat64';

	getSQLType(): string {
		return 'float64';
	}
}

export function float64(): GoogleSqlFloat64BuilderInitial<''>;
export function float64<TName extends string>(
	name: TName,
): GoogleSqlFloat64BuilderInitial<TName>;
export function float64(name?: string) {
	return new GoogleSqlFloat64Builder(name ?? '');
}
