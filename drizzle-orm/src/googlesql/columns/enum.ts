import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGoogleSqlTable } from '~/googlesql/table.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { GoogleSqlColumn, GoogleSqlColumnBuilder } from './common.ts';

export type GoogleSqlEnumColumnBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	GoogleSqlEnumColumnBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'GoogleSqlEnumColumn';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
	}>;

export class GoogleSqlEnumColumnBuilder<T extends ColumnBuilderBaseConfig<'string', 'GoogleSqlEnumColumn'>>
	extends GoogleSqlColumnBuilder<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'GoogleSqlEnumColumnBuilder';

	constructor(name: T['name'], values: T['enumValues']) {
		super(name, 'string', 'GoogleSqlEnumColumn');
		this.config.enumValues = values;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGoogleSqlTable<{ name: TTableName }>,
	): GoogleSqlEnumColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new GoogleSqlEnumColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GoogleSqlEnumColumn<T extends ColumnBaseConfig<'string', 'GoogleSqlEnumColumn'>>
	extends GoogleSqlColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'GoogleSqlEnumColumn';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return `enum(${this.enumValues!.map((value) => `'${value}'`).join(',')})`;
	}
}

export function googlesqlEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	values: T | Writable<T>,
): GoogleSqlEnumColumnBuilderInitial<'', Writable<T>>;
export function googlesqlEnum<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	values: T | Writable<T>,
): GoogleSqlEnumColumnBuilderInitial<TName, Writable<T>>;
export function googlesqlEnum(
	a?: string | readonly [string, ...string[]] | [string, ...string[]],
	b?: readonly [string, ...string[]] | [string, ...string[]],
): any {
	const { name, config: values } = getColumnNameAndConfig<readonly [string, ...string[]] | [string, ...string[]]>(a, b);

	if (values.length === 0) {
		throw new Error(`You have an empty array for "${name}" enum values`);
	}

	return new GoogleSqlEnumColumnBuilder(name, values as any);
}
