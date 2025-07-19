import type { RelativeDuration } from 'gel';
import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelRelDurationBuilderInitial<TName extends string> = GelRelDurationBuilder<{
	name: TName;
	dataType: 'relDuration';
	columnType: 'GelRelDuration';
	data: RelativeDuration;
	driverParam: RelativeDuration;
	enumValues: undefined;
}>;

export class GelRelDurationBuilder<T extends ColumnBuilderBaseConfig<'relDuration'>>
	extends GelColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GelRelDurationBuilder';

	constructor(
		name: T['name'],
	) {
		super(name, 'relDuration', 'GelRelDuration');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelRelDuration(
			table,
			this.config as any,
		);
	}
}

export class GelRelDuration<T extends ColumnBaseConfig<'relDuration'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelRelDuration';

	getSQLType(): string {
		return `edgedbt.relative_duration_t`;
	}
}

export function relDuration(): GelRelDurationBuilderInitial<''>;
export function relDuration<TName extends string>(name: TName): GelRelDurationBuilderInitial<TName>;
export function relDuration(name?: string) {
	return new GelRelDurationBuilder(name ?? '');
}
