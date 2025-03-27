import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';

export type GelSmallIntBuilderInitial<TName extends string> = GelSmallIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GelSmallInt';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class GelSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number', 'GelSmallInt'>>
	extends GelIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'GelSmallIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'GelSmallInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelSmallInt<MakeColumnConfig<T, TTableName>> {
		return new GelSmallInt<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class GelSmallInt<T extends ColumnBaseConfig<'number', 'GelSmallInt'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelSmallInt';

	getSQLType(): string {
		return 'smallint';
	}
}

export function smallint(): GelSmallIntBuilderInitial<''>;
export function smallint<TName extends string>(name: TName): GelSmallIntBuilderInitial<TName>;
export function smallint(name?: string) {
	return new GelSmallIntBuilder(name ?? '');
}
