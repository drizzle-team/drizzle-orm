import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlMediumIntBuilderInitial<TName extends string> = MsSqlMediumIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlMediumInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MsSqlMediumIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlMediumInt'>>
	extends MsSqlColumnBuilderWithIdentity<T>
{
	static readonly [entityKind]: string = 'MsSqlMediumIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MsSqlMediumInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlMediumInt<MakeColumnConfig<T, TTableName>> {
		return new MsSqlMediumInt<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class MsSqlMediumInt<T extends ColumnBaseConfig<'number', 'MsSqlMediumInt'>> extends MsSqlColumnWithIdentity<T> {
	static readonly [entityKind]: string = 'MsSqlMediumInt';

	_getSQLType(): string {
		return `mediumint`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function mediumint<TName extends string>(
	name: TName,
): MsSqlMediumIntBuilderInitial<TName> {
	return new MsSqlMediumIntBuilder(name);
}
