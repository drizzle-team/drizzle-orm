import type { LocalDateTime } from 'gel';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable, GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelLocalDateColumnBaseBuilder } from './date.common.ts';

export class GelTimestampBuilder extends GelLocalDateColumnBaseBuilder<
	{
		dataType: 'object localDateTime';
		data: LocalDateTime;
		driverParam: LocalDateTime;
	}
> {
	static override readonly [entityKind]: string = 'GelTimestampBuilder';

	constructor(
		name: string,
	) {
		super(name, 'object localDateTime', 'GelTimestamp');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelTimestamp(
			table,
			this.config as any,
		);
	}
}

export class GelTimestamp<T extends ColumnBaseConfig<'object localDateTime'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelTimestamp';

	constructor(table: AnyGelTable<{ name: T['tableName'] }>, config: GelTimestampBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'cal::local_datetime';
	}
}

export function timestamp(name?: string): GelTimestampBuilder {
	return new GelTimestampBuilder(name ?? '');
}
