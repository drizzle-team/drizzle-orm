import type { DateDuration } from 'gel';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export class GelDateDurationBuilder extends GelColumnBuilder<{
	dataType: 'object dateDuration';
	data: DateDuration;
	driverParam: DateDuration;
}> {
	static override readonly [entityKind]: string = 'GelDateDurationBuilder';

	constructor(
		name: string,
	) {
		super(name, 'object dateDuration', 'GelDateDuration');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelDateDuration(
			table,
			this.config as any,
		);
	}
}

export class GelDateDuration<T extends ColumnBaseConfig<'object dateDuration'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelDateDuration';

	getSQLType(): string {
		return `dateDuration`;
	}
}

export function dateDuration(name?: string): GelDateDurationBuilder {
	return new GelDateDurationBuilder(name ?? '');
}
