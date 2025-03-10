import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlBytesBuilderInitial<TName extends string> = GoogleSqlBytesBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'GoogleSqlBytes';
	data: Buffer;
	driverParam: Buffer;
	enumValues: undefined;
}>;

export class GoogleSqlBytesBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'GoogleSqlBytes'>>
	extends GoogleSqlColumnBuilder<
		T,
		GoogleSqlBytesConfig
	>
{
	static override readonly [entityKind]: string = 'GoogleSqlBytesBuilder';

	constructor(name: T['name'], length: number | "MAX" |  undefined) {
		super(name, 'buffer', 'GoogleSqlBytes');
		this.config.length = length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlBytes<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlBytes<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlBytes<T extends ColumnBaseConfig<'buffer', 'GoogleSqlBytes'>> extends GoogleSqlColumn<
	T,
	GoogleSqlBytesConfig
> {
	static override readonly [entityKind]: string = 'GoogleSqlBytes';

	length: number | "MAX" | undefined = this.config.length;

	getSQLType(): string {
		return `bytes(${this.length === undefined ? "MAX" : this.length})`;
	}
}

export interface GoogleSqlBytesConfig {
	length?: number | "MAX";
}

export function bytes(): GoogleSqlBytesBuilderInitial<''>;
export function bytes(
	config?: GoogleSqlBytesConfig,
): GoogleSqlBytesBuilderInitial<''>;
export function bytes<TName extends string>(
	name: TName,
	config?: GoogleSqlBytesConfig,
): GoogleSqlBytesBuilderInitial<TName>;
export function bytes(a?: string | GoogleSqlBytesConfig, b: GoogleSqlBytesConfig = {}) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlBytesConfig>(a, b);
	return new GoogleSqlBytesBuilder(name, config.length);
}
