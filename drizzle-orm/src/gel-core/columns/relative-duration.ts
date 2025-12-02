import type { RelativeDuration } from 'gel';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export class GelRelDurationBuilder extends GelColumnBuilder<{
	dataType: 'object relDuration';
	data: RelativeDuration;
	driverParam: RelativeDuration;
}> {
	static override readonly [entityKind]: string = 'GelRelDurationBuilder';

	constructor(
		name: string,
	) {
		super(name, 'object relDuration', 'GelRelDuration');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelRelDuration(
			table,
			this.config as any,
		);
	}
}

export class GelRelDuration<T extends ColumnBaseConfig<'object relDuration'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelRelDuration';

	getSQLType(): string {
		return `edgedbt.relative_duration_t`;
	}
}

export function relDuration(name?: string): GelRelDurationBuilder {
	return new GelRelDurationBuilder(name ?? '');
}
