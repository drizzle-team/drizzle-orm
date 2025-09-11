import type { Duration } from 'gel';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export class GelDurationBuilder extends GelColumnBuilder<{
	dataType: 'object duration';
	data: Duration;
	driverParam: Duration;
}> {
	static override readonly [entityKind]: string = 'GelDurationBuilder';

	constructor(
		name: string,
	) {
		super(name, 'object duration', 'GelDuration');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelDuration(table, this.config as any);
	}
}

export class GelDuration<T extends ColumnBaseConfig<'object duration'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelDuration';

	getSQLType(): string {
		return `duration`;
	}
}

export function duration(name?: string): GelDurationBuilder {
	return new GelDurationBuilder(name ?? '');
}
