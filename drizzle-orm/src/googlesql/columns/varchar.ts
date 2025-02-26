import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlVarCharBuilderInitial<
	TName extends string,
	TEnum extends [string, ...string[]],
	TLength extends number | undefined,
> = GoogleSqlVarCharBuilder<
	{
		name: TName;
		dataType: 'string';
		columnType: 'GoogleSqlVarChar';
		data: TEnum[number];
		driverParam: number | string;
		enumValues: TEnum;
		length: TLength;
	}
>;

export class GoogleSqlVarCharBuilder<
	T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlVarChar'> & { length?: number | undefined },
> extends GoogleSqlColumnBuilder<T, GoogleSqlVarCharConfig<T['enumValues'], T['length']>> {
	static override readonly [entityKind]: string = 'GoogleSqlVarCharBuilder';

	/** @internal */
	constructor(name: T['name'], config: GoogleSqlVarCharConfig<T['enumValues'], T['length']>) {
		super(name, 'string', 'GoogleSqlVarChar');
		this.config.length = config.length;
		this.config.enum = config.enum;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlVarChar<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }> {
		return new GoogleSqlVarChar<MakeColumnConfig<T, TTableName> & { length: T['length']; enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlVarChar<T extends ColumnBaseConfig<'string', 'GoogleSqlVarChar'> & { length?: number | undefined }>
	extends GoogleSqlColumn<T, GoogleSqlVarCharConfig<T['enumValues'], T['length']>, { length: T['length'] }>
{
	static override readonly [entityKind]: string = 'GoogleSqlVarChar';

	readonly length: number | undefined = this.config.length;

	override readonly enumValues = this.config.enum;

	getSQLType(): string {
		return this.length === undefined ? `varchar` : `varchar(${this.length})`;
	}
}

export interface GoogleSqlVarCharConfig<
	TEnum extends string[] | readonly string[] | undefined = string[] | readonly string[] | undefined,
	TLength extends number | undefined = number | undefined,
> {
	enum?: TEnum;
	length?: TLength;
}

export function varchar<U extends string, T extends Readonly<[U, ...U[]]>, L extends number | undefined>(
	config: GoogleSqlVarCharConfig<T | Writable<T>, L>,
): GoogleSqlVarCharBuilderInitial<'', Writable<T>, L>;
export function varchar<
	TName extends string,
	U extends string,
	T extends Readonly<[U, ...U[]]>,
	L extends number | undefined,
>(
	name: TName,
	config: GoogleSqlVarCharConfig<T | Writable<T>, L>,
): GoogleSqlVarCharBuilderInitial<TName, Writable<T>, L>;
export function varchar(a?: string | GoogleSqlVarCharConfig, b?: GoogleSqlVarCharConfig): any {
	const { name, config } = getColumnNameAndConfig<GoogleSqlVarCharConfig>(a, b);
	return new GoogleSqlVarCharBuilder(name, config as any);
}
