import type { LocalTime } from 'gel';
import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelLocalDateColumnBaseBuilder } from './date.common.ts';

export type GelLocalTimeBuilderInitial<TName extends string> = GelLocalTimeBuilder<{
	name: TName;
	dataType: 'localTime';
	columnType: 'GelLocalTime';
	data: LocalTime;
	driverParam: LocalTime;
	enumValues: undefined;
}>;

export class GelLocalTimeBuilder<T extends ColumnBuilderBaseConfig<'localTime', 'GelLocalTime'>>
	extends GelLocalDateColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'GelLocalTimeBuilder';

	constructor(name: T['name']) {
		super(name, 'localTime', 'GelLocalTime');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelLocalTime(
			table,
			this.config as any,
		);
	}
}

export class GelLocalTime<T extends ColumnBaseConfig<'localTime', 'GelLocalTime'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelLocalTime';

	getSQLType(): string {
		return 'cal::local_time';
	}
}

export function localTime(): GelLocalTimeBuilderInitial<''>;
export function localTime<TName extends string>(name: TName): GelLocalTimeBuilderInitial<TName>;
export function localTime(name?: string) {
	return new GelLocalTimeBuilder(name ?? '');
}
