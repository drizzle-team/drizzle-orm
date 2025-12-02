import type { LocalDate } from 'gel';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelLocalDateColumnBaseBuilder } from './date.common.ts';

export class GelLocalDateStringBuilder extends GelLocalDateColumnBaseBuilder<{
	dataType: 'object localDate';
	data: LocalDate;
	driverParam: LocalDate;
}> {
	static override readonly [entityKind]: string = 'GelLocalDateStringBuilder';

	constructor(name: string) {
		super(name, 'object localDate', 'GelLocalDateString');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelLocalDateString(
			table,
			this.config as any,
		);
	}
}

export class GelLocalDateString<T extends ColumnBaseConfig<'object localDate'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelLocalDateString';

	getSQLType(): string {
		return 'cal::local_date';
	}
}

export function localDate(name?: string): GelLocalDateStringBuilder {
	return new GelLocalDateStringBuilder(name ?? '');
}
