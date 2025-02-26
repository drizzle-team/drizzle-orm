import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumnBuilderWithAutoIncrement, GoogleSqlColumnWithAutoIncrement } from './common.ts';
import type { GoogleSqlIntConfig } from './int.ts';

export type GoogleSqlSmallIntBuilderInitial<TName extends string> = GoogleSqlSmallIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlSmallInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class GoogleSqlSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlSmallInt'>>
	extends GoogleSqlColumnBuilderWithAutoIncrement<T, GoogleSqlIntConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlSmallIntBuilder';

	constructor(name: T['name'], config?: GoogleSqlIntConfig) {
		super(name, 'number', 'GoogleSqlSmallInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlSmallInt<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlSmallInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlSmallInt<T extends ColumnBaseConfig<'number', 'GoogleSqlSmallInt'>>
	extends GoogleSqlColumnWithAutoIncrement<T, GoogleSqlIntConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlSmallInt';

	getSQLType(): string {
		return `smallint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function smallint(): GoogleSqlSmallIntBuilderInitial<''>;
export function smallint(
	config?: GoogleSqlIntConfig,
): GoogleSqlSmallIntBuilderInitial<''>;
export function smallint<TName extends string>(
	name: TName,
	config?: GoogleSqlIntConfig,
): GoogleSqlSmallIntBuilderInitial<TName>;
export function smallint(a?: string | GoogleSqlIntConfig, b?: GoogleSqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlIntConfig>(a, b);
	return new GoogleSqlSmallIntBuilder(name, config);
}
