import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export type MsSqlRealBuilderInitial<TName extends string> = MsSqlRealBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlReal';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class MsSqlRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlReal'>>
	extends MsSqlColumnBuilderWithIdentity<T>
{
	static readonly [entityKind]: string = 'MsSqlRealBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'MsSqlReal');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	): MsSqlReal<MakeColumnConfig<T, TTableName>> {
		return new MsSqlReal<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class MsSqlReal<T extends ColumnBaseConfig<'number', 'MsSqlReal'>> extends MsSqlColumnWithIdentity<T> {
	static readonly [entityKind]: string = 'MsSqlReal';

	_getSQLType(): string {
		return 'real';
	}
}

export function real<TName extends string>(name: TName): MsSqlRealBuilderInitial<TName> {
	return new MsSqlRealBuilder(name);
}
