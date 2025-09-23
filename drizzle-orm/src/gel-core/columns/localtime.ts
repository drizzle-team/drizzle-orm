import type { LocalTime } from 'gel';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelLocalDateColumnBaseBuilder } from './date.common.ts';

export class GelLocalTimeBuilder extends GelLocalDateColumnBaseBuilder<{
	dataType: 'object localTime';
	data: LocalTime;
	driverParam: LocalTime;
}> {
	static override readonly [entityKind]: string = 'GelLocalTimeBuilder';

	constructor(name: string) {
		super(name, 'object localTime', 'GelLocalTime');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelLocalTime(
			table,
			this.config as any,
		);
	}
}

export class GelLocalTime<T extends ColumnBaseConfig<'object localTime'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelLocalTime';

	getSQLType(): string {
		return 'cal::local_time';
	}
}

export function localTime(name?: string): GelLocalTimeBuilder {
	return new GelLocalTimeBuilder(name ?? '');
}
