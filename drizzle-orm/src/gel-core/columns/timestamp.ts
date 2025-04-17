import type { LocalDateTime } from 'gel';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelLocalDateColumnBaseBuilder } from './date.common.ts';

export type GelTimestampBuilderInitial<TName extends string> = GelTimestampBuilder<{
	name: TName;
	dataType: 'localDateTime';
	columnType: 'GelTimestamp';
	data: LocalDateTime;
	driverParam: LocalDateTime;
	enumValues: undefined;
}>;

export class GelTimestampBuilder<T extends ColumnBuilderBaseConfig<'localDateTime', 'GelTimestamp'>>
	extends GelLocalDateColumnBaseBuilder<
		T
	>
{
	static override readonly [entityKind]: string = 'GelTimestampBuilder';

	constructor(
		name: T['name'],
	) {
		super(name, 'localDateTime', 'GelTimestamp');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelTimestamp<MakeColumnConfig<T, TTableName>> {
		return new GelTimestamp<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GelTimestamp<T extends ColumnBaseConfig<'localDateTime', 'GelTimestamp'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelTimestamp';

	constructor(table: AnyGelTable<{ name: T['tableName'] }>, config: GelTimestampBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'cal::local_datetime';
	}
}

export function timestamp(): GelTimestampBuilderInitial<''>;
export function timestamp<TName extends string>(
	name: TName,
): GelTimestampBuilderInitial<TName>;
export function timestamp(name?: string) {
	return new GelTimestampBuilder(name ?? '');
}
