import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';

export type GelInt53BuilderInitial<TName extends string> = GelInt53Builder<{
	name: TName;
	dataType: 'number';
	columnType: 'GelInt53';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class GelInt53Builder<T extends ColumnBuilderBaseConfig<'number', 'GelInt53'>>
	extends GelIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'GelInt53Builder';

	constructor(name: T['name']) {
		super(name, 'number', 'GelInt53');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelInt53<MakeColumnConfig<T, TTableName>> {
		return new GelInt53<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class GelInt53<T extends ColumnBaseConfig<'number', 'GelInt53'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelInt53';

	getSQLType(): string {
		return 'bigint';
	}
}

export function bigint(): GelInt53BuilderInitial<''>;
export function bigint<TName extends string>(name: TName): GelInt53BuilderInitial<TName>;
export function bigint(name?: string) {
	return new GelInt53Builder(name ?? '');
}
