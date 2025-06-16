import type { LocalDate } from 'gel';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelLocalDateColumnBaseBuilder } from './date.common.ts';

export type GelLocalDateStringBuilderInitial<TName extends string> = GelLocalDateStringBuilder<{
	name: TName;
	dataType: 'localDate';
	columnType: 'GelLocalDateString';
	data: LocalDate;
	driverParam: LocalDate;
	enumValues: undefined;
}>;

export class GelLocalDateStringBuilder<T extends ColumnBuilderBaseConfig<'localDate', 'GelLocalDateString'>>
	extends GelLocalDateColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'GelLocalDateStringBuilder';

	constructor(name: T['name']) {
		super(name, 'localDate', 'GelLocalDateString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelLocalDateString<MakeColumnConfig<T, TTableName>> {
		return new GelLocalDateString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GelLocalDateString<T extends ColumnBaseConfig<'localDate', 'GelLocalDateString'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelLocalDateString';

	getSQLType(): string {
		return 'cal::local_date';
	}
}

export function localDate(): GelLocalDateStringBuilderInitial<''>;
export function localDate<TName extends string>(name: TName): GelLocalDateStringBuilderInitial<TName>;
export function localDate(name?: string) {
	return new GelLocalDateStringBuilder(name ?? '');
}
