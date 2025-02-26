import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlYearBuilderInitial<TName extends string> = GoogleSqlYearBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlYear';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class GoogleSqlYearBuilder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlYear'>> extends GoogleSqlColumnBuilder<T> {
	static override readonly [entityKind]: string = 'GoogleSqlYearBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'GoogleSqlYear');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlYear<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlYear<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class GoogleSqlYear<
	T extends ColumnBaseConfig<'number', 'GoogleSqlYear'>,
> extends GoogleSqlColumn<T> {
	static override readonly [entityKind]: string = 'GoogleSqlYear';

	getSQLType(): string {
		return `year`;
	}
}

export function year(): GoogleSqlYearBuilderInitial<''>;
export function year<TName extends string>(name: TName): GoogleSqlYearBuilderInitial<TName>;
export function year(name?: string) {
	return new GoogleSqlYearBuilder(name ?? '');
}
