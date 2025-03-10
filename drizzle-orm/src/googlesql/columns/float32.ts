import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { GoogleSqlColumnBuilder, GoogleSqlColumn } from './common.ts';

export type GoogleSqlFloat32BuilderInitial<TName extends string> = GoogleSqlFloat32Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlFloat32';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class GoogleSqlFloat32Builder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlFloat32'>>
	extends GoogleSqlColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlFloat32Builder';

	constructor(name: T['name']) {
		super(name, 'number', 'GoogleSqlFloat32');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlFloat32<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlFloat32<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlFloat32<T extends ColumnBaseConfig<'number', 'GoogleSqlFloat32'>>
	extends GoogleSqlColumn<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlFloat32';

	getSQLType(): string {
		return 'float32';
	}
}

export function float32(): GoogleSqlFloat32BuilderInitial<''>;
export function float32<TName extends string>(
	name: TName,
): GoogleSqlFloat32BuilderInitial<TName>;
export function float32(name?: string) {
	return new GoogleSqlFloat32Builder(name ?? '');
}
