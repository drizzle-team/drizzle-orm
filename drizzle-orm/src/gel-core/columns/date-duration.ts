import type { DateDuration } from 'gel';
import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelDateDurationBuilderInitial<TName extends string> = GelDateDurationBuilder<{
	name: TName;
	dataType: 'dateDuration';
	columnType: 'GelDateDuration';
	data: DateDuration;
	driverParam: DateDuration;
	enumValues: undefined;
}>;

export class GelDateDurationBuilder<T extends ColumnBuilderBaseConfig<'dateDuration', 'GelDateDuration'>>
	extends GelColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'GelDateDurationBuilder';

	constructor(
		name: T['name'],
	) {
		super(name, 'dateDuration', 'GelDateDuration');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelDateDuration(
			table,
			this.config as any,
		);
	}
}

export class GelDateDuration<T extends ColumnBaseConfig<'dateDuration', 'GelDateDuration'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelDateDuration';

	getSQLType(): string {
		return `dateDuration`;
	}
}

export function dateDuration(): GelDateDurationBuilderInitial<''>;
export function dateDuration<TName extends string>(name: TName): GelDateDurationBuilderInitial<TName>;
export function dateDuration(name?: string) {
	return new GelDateDurationBuilder(name ?? '');
}
