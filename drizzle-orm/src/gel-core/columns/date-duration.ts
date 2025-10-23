import type { DateDuration } from 'gel';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelDateDurationBuilderInitial<TName extends string> = GelDateDurationBuilder<{
	name: TName;
	dataType: 'dateDuration';
	columnType: 'GelDateDuration';
	data: DateDuration;
	driverParam: DateDuration;
	enumValues: undefined;
}>;

export class GelDateDurationBuilder<T extends ColumnBuilderBaseConfig<'dateDuration', 'GelDateDuration'>>
	extends GelColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GelDateDurationBuilder';

	constructor(
		name: T['name'],
	) {
		super(name, 'dateDuration', 'GelDateDuration');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelDateDuration<MakeColumnConfig<T, TTableName>> {
		return new GelDateDuration<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GelDateDuration<T extends ColumnBaseConfig<'dateDuration', 'GelDateDuration'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelDateDuration';

	getSQLType(): string {
		return `dateDuration`;
	}
}

export function dateDuration(): GelDateDurationBuilderInitial<''>;
export function dateDuration<TName extends string>(name: TName): GelDateDurationBuilderInitial<TName>;
export function dateDuration(name?: string) {
	return new GelDateDurationBuilder(name ?? '');
}
