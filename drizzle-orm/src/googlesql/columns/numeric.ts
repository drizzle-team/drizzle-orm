import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder} from './common.ts';

export type GoogleSqlNumericBuilderInitial<TName extends string> = GoogleSqlNumericBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'GoogleSqlNumeric';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class GoogleSqlNumericBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlNumeric'>,
> extends GoogleSqlColumnBuilder<T> {
	static override readonly [entityKind]: string = 'GoogleSqlNumericBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'GoogleSqlNumeric');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlNumeric<MakeColumnConfig<T, TTableName>> {
		return new GoogleSqlNumeric<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlNumeric<T extends ColumnBaseConfig<'string', 'GoogleSqlNumeric'>>
	extends GoogleSqlColumn<T>
{
	static override readonly [entityKind]: string = 'GoogleSqlNumeric';

	getSQLType(): string {
		return 'numeric';
	}
}


export function numeric(): GoogleSqlNumericBuilderInitial<''>;

export function numeric<TName extends string>(
	name: TName,
): GoogleSqlNumericBuilderInitial<TName>;
export function numeric(name?: string) {
	return new GoogleSqlNumericBuilder(name ?? '');
}
