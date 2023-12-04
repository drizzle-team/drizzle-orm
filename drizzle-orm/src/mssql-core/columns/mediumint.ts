import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';
import type { MsSqlIntConfig } from './int.ts';

export type MsSqlMediumIntBuilderInitial<TName extends string> = MsSqlMediumIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'MsSqlMediumInt';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class MsSqlMediumIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'MsSqlMediumInt'>>
	extends MsSqlColumnBuilderWithIdentity<T, MsSqlIntConfig>
{
	static readonly [entityKind]: string = 'MsSqlMediumIntBuilder';

	constructor(name: T['name'], config?: MsSqlIntConfig) {
		super(name, 'number', 'MsSqlMediumInt');
		this.config.unsigned = config ? config.unsigned : false;
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

export class MsSqlMediumInt<T extends ColumnBaseConfig<'number', 'MsSqlMediumInt'>>
	extends MsSqlColumnWithIdentity<T, MsSqlIntConfig>
{
	static readonly [entityKind]: string = 'MsSqlMediumInt';

	_getSQLType(): string {
		return `mediumint${this.config.unsigned ? ' unsigned' : ''}`;
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
	config?: MsSqlIntConfig,
): MsSqlMediumIntBuilderInitial<TName> {
	return new MsSqlMediumIntBuilder(name, config);
}
