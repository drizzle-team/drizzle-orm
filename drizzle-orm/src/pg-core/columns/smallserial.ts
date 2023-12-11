import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgSmallSerialBuilderInitial<TName extends string> = PgSmallSerialBuilder<
	{
		name: TName;
		dataType: 'number';
		columnType: 'PgSmallSerial';
		data: number;
		driverParam: number;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class PgSmallSerialBuilder<T extends ColumnBuilderBaseConfig<'number', 'PgSmallSerial'>>
	extends PgColumnBuilder<T>
{
	static readonly [entityKind]: string = 'PgSmallSerialBuilder';

	constructor(name: string) {
		super(name, 'number', 'PgSmallSerial');
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgSmallSerial<MakeColumnConfig<T, TTableName>> {
		return new PgSmallSerial<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgSmallSerial<T extends ColumnBaseConfig<'number', 'PgSmallSerial'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgSmallSerial';

	getSQLType(): string {
		return 'smallserial';
	}
}

export function smallserial<TName extends string>(name: TName): PgSmallSerialBuilderInitial<TName> {
	return new PgSmallSerialBuilder(name);
}
