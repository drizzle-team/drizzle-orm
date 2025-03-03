import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlVarBinaryBuilderInitial<TName extends string> = GoogleSqlVarBinaryBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GoogleSqlVarBinary';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class GoogleSqlVarBinaryBuilder<T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlVarBinary'>>
	extends GoogleSqlColumnBuilder<T, GoogleSqlVarbinaryOptions>
{
	static override readonly [entityKind]: string = 'GoogleSqlVarBinaryBuilder';

	/** @internal */
	constructor(name: T['name'], config: GoogleSqlVarbinaryOptions) {
		super(name, 'string', 'GoogleSqlVarBinary');
		this.config.length = config?.length;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlVarBinary<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlVarBinary<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlVarBinary<
	T extends ColumnBaseConfig<'string', 'GoogleSqlVarBinary'>,
> extends GoogleSqlColumn<T, GoogleSqlVarbinaryOptions> {
	static override readonly [entityKind]: string = 'GoogleSqlVarBinary';

	length: number | undefined = this.config.length;

	getSQLType(): string {
		return this.length === undefined ? `varbinary` : `varbinary(${this.length})`;
	}
}

export interface GoogleSqlVarbinaryOptions {
	length: number;
}

export function varbinary(
	config: GoogleSqlVarbinaryOptions,
): GoogleSqlVarBinaryBuilderInitial<''>;
export function varbinary<TName extends string>(
	name: TName,
	config: GoogleSqlVarbinaryOptions,
): GoogleSqlVarBinaryBuilderInitial<TName>;
export function varbinary(a?: string | GoogleSqlVarbinaryOptions, b?: GoogleSqlVarbinaryOptions) {
	const { name, config } = getColumnNameAndConfig<GoogleSqlVarbinaryOptions>(a, b);
	return new GoogleSqlVarBinaryBuilder(name, config);
}
