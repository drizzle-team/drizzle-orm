import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlBooleanBuilderInitial<TName extends string> = GoogleSqlBooleanBuilder<{
	name: TName;
	dataType: 'boolean';
	columnType: 'GoogleSqlBoolean';
	data: boolean;
	driverParam: number | boolean;
	enumValues: undefined;
}>;

export class GoogleSqlBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'GoogleSqlBoolean'>>
	extends GoogleSqlColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'GoogleSqlBoolean');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlBoolean<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlBoolean<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlBoolean<T extends ColumnBaseConfig<'boolean', 'GoogleSqlBoolean'>> extends GoogleSqlColumn<T> {
	static override readonly [entityKind]: string = 'GoogleSqlBoolean';

	getSQLType(): string {
		return 'boolean';
	}

	override mapFromDriverValue(value: number | boolean): boolean {
		if (typeof value === 'boolean') {
			return value;
		}
		return value === 1;
	}
}

export function boolean(): GoogleSqlBooleanBuilderInitial<''>;
export function boolean<TName extends string>(name: TName): GoogleSqlBooleanBuilderInitial<TName>;
export function boolean(name?: string) {
	return new GoogleSqlBooleanBuilder(name ?? '');
}
