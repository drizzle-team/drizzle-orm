import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlInt64BuilderInitial<TName extends string> = GoogleSqlInt64Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlInt64';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class GoogleSqlInt64Builder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlInt64'>>
	extends GoogleSqlColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlInt64Builder';

	constructor(name: T['name']) {
		super(name, 'number', 'GoogleSqlInt64');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlInt64<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlInt64<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlInt64<T extends ColumnBaseConfig<'number', 'GoogleSqlInt64'>>
	extends GoogleSqlColumn<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlInt64';

	getSQLType(): string {
		return `int64`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function int64(): GoogleSqlInt64BuilderInitial<''>;
export function int64<TName extends string>(
	name: TName
): GoogleSqlInt64BuilderInitial<TName>;
export function int64(name?: string) {
	return new GoogleSqlInt64Builder(name ?? '');
}
