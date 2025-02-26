import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlJsonBuilderInitial<TName extends string> = GoogleSqlJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'GoogleSqlJson';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
}>;

export class GoogleSqlJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'GoogleSqlJson'>> extends GoogleSqlColumnBuilder<T> {
	static override readonly [entityKind]: string = 'GoogleSqlJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'GoogleSqlJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlJson<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlJson<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class GoogleSqlJson<T extends ColumnBaseConfig<'json', 'GoogleSqlJson'>> extends GoogleSqlColumn<T> {
	static override readonly [entityKind]: string = 'GoogleSqlJson';

	getSQLType(): string {
		return 'json';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export function json(): GoogleSqlJsonBuilderInitial<''>;
export function json<TName extends string>(name: TName): GoogleSqlJsonBuilderInitial<TName>;
export function json(name?: string) {
	return new GoogleSqlJsonBuilder(name ?? '');
}
