import type { Duration } from 'gel';
import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelDurationBuilderInitial<TName extends string> = GelDurationBuilder<{
	name: TName;
	dataType: 'duration';
	columnType: 'GelDuration';
	data: Duration;
	driverParam: Duration;
	enumValues: undefined;
}>;

export class GelDurationBuilder<T extends ColumnBuilderBaseConfig<'duration', 'GelDuration'>>
	extends GelColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GelDurationBuilder';

	constructor(
		name: T['name'],
	) {
		super(name, 'duration', 'GelDuration');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelDuration(table, this.config as any);
	}
}

export class GelDuration<T extends ColumnBaseConfig<'duration', 'GelDuration'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelDuration';

	getSQLType(): string {
		return `duration`;
	}
}

export function duration(): GelDurationBuilderInitial<''>;
export function duration<TName extends string>(name: TName): GelDurationBuilderInitial<TName>;
export function duration(name?: string) {
	return new GelDurationBuilder(name ?? '');
}
