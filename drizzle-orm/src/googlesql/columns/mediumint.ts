import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumnBuilderWithAutoIncrement, GoogleSqlColumnWithAutoIncrement } from './common.ts';
import type { GoogleSqlIntConfig } from './int.ts';

export type GoogleSqlMediumIntBuilderInitial<TName extends string> = GoogleSqlMediumIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GoogleSqlMediumInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class GoogleSqlMediumIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'GoogleSqlMediumInt'>>
	extends GoogleSqlColumnBuilderWithAutoIncrement<T, GoogleSqlIntConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlMediumIntBuilder';

	constructor(name: T['name'], config?: GoogleSqlIntConfig) {
		super(name, 'number', 'GoogleSqlMediumInt');
		this.config.unsigned = config ? config.unsigned : false;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlMediumInt<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlMediumInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlMediumInt<T extends ColumnBaseConfig<'number', 'GoogleSqlMediumInt'>>
	extends GoogleSqlColumnWithAutoIncrement<T, GoogleSqlIntConfig>
{
	static override readonly [entityKind]: string = 'GoogleSqlMediumInt';

	getSQLType(): string {
		return `mediumint${this.config.unsigned ? ' unsigned' : ''}`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function mediumint(): GoogleSqlMediumIntBuilderInitial<''>;
export function mediumint(
	config?: GoogleSqlIntConfig,
): GoogleSqlMediumIntBuilderInitial<''>;
export function mediumint<TName extends string>(
	name: TName,
	config?: GoogleSqlIntConfig,
): GoogleSqlMediumIntBuilderInitial<TName>;
export function mediumint(a?: string | GoogleSqlIntConfig, b?: GoogleSqlIntConfig) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlIntConfig>(a, b);
	return new GoogleSqlMediumIntBuilder(name, config);
}
