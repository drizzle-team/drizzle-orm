import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumnBuilderWithAutoIncrement, GoogleSqlColumnWithAutoIncrement } from './common.ts';
import type { GoogleSqlIntConfig } from './int.ts';

export type GoogleSqlTinyIntBuilderInitial<TName extends string> = GoogleSqlTinyIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlTinyInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class GoogleSqlTinyIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlTinyInt'>>
	extends GoogleSqlColumnBuilderWithAutoIncrement<T, GoogleSqlIntConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlTinyIntBuilder';

	constructor(name: T['name'], config?: GoogleSqlIntConfig) {
		super(name, 'number', 'GoogleSqlTinyInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlTinyInt<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlTinyInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlTinyInt<T extends ColumnBaseConfig<'number', 'GoogleSqlTinyInt'>>
	extends GoogleSqlColumnWithAutoIncrement<T, GoogleSqlIntConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlTinyInt';

	getSQLType(): string {
		return `tinyint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function tinyint(): GoogleSqlTinyIntBuilderInitial<''>;
export function tinyint(
	config?: GoogleSqlIntConfig,
): GoogleSqlTinyIntBuilderInitial<''>;
export function tinyint<TName extends string>(
	name: TName,
	config?: GoogleSqlIntConfig,
): GoogleSqlTinyIntBuilderInitial<TName>;
export function tinyint(a?: string | GoogleSqlIntConfig, b?: GoogleSqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlIntConfig>(a, b);
	return new GoogleSqlTinyIntBuilder(name, config);
}
