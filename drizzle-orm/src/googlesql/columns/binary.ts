import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlBinaryBuilderInitial<TName extends string> = GoogleSqlBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GoogleSqlBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class GoogleSqlBinaryBuilder<T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlBinary'>>
	extends GoogleSqlColumnBuilder<
		T,
		GoogleSqlBinaryConfig
	>
{
	static override readonly [entityKind]: string = 'GoogleSqlBinaryBuilder';

	constructor(name: T['name'], length: number | undefined) {
		super(name, 'string', 'GoogleSqlBinary');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlBinary<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlBinary<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlBinary<T extends ColumnBaseConfig<'string', 'GoogleSqlBinary'>> extends GoogleSqlColumn<
	T,
	GoogleSqlBinaryConfig
> {
	static override readonly [entityKind]: string = 'GoogleSqlBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `binary` : `binary(${this.length})`;
	}
}

export interface GoogleSqlBinaryConfig {
	length?: number;
}

export function binary(): GoogleSqlBinaryBuilderInitial<''>;
export function binary(
	config?: GoogleSqlBinaryConfig,
): GoogleSqlBinaryBuilderInitial<''>;
export function binary<TName extends string>(
	name: TName,
	config?: GoogleSqlBinaryConfig,
): GoogleSqlBinaryBuilderInitial<TName>;
export function binary(a?: string | GoogleSqlBinaryConfig, b: GoogleSqlBinaryConfig = {}) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlBinaryConfig>(a, b);
	return new GoogleSqlBinaryBuilder(name, config.length);
}
