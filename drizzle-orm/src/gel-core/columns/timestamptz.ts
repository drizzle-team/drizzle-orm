import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelLocalDateColumnBaseBuilder } from './date.common.ts';

export type GelTimestampTzBuilderInitial<TName extends string> = GelTimestampTzBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'GelTimestampTz';
	data: Date;
	driverParam: Date;
	enumValues: undefined;
}>;

export class GelTimestampTzBuilder<T extends ColumnBuilderBaseConfig<'date', 'GelTimestampTz'>>
	extends GelLocalDateColumnBaseBuilder<
		T
	>
{
	static override readonly [entityKind]: string = 'GelTimestampTzBuilder';

	constructor(
		name: T['name'],
	) {
		super(name, 'date', 'GelTimestampTz');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelTimestampTz<MakeColumnConfig<T, TTableName>> {
		return new GelTimestampTz<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class GelTimestampTz<T extends ColumnBaseConfig<'date', 'GelTimestampTz'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelTimestampTz';

	constructor(table: AnyGelTable<{ name: T['tableName'] }>, config: GelTimestampTzBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'datetime';
	}
}

export function timestamptz(): GelTimestampTzBuilderInitial<''>;
export function timestamptz<TName extends string>(
	name: TName,
): GelTimestampTzBuilderInitial<TName>;
export function timestamptz(name?: string) {
	return new GelTimestampTzBuilder(name ?? '');
}
