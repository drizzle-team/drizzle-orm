import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable, GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelLocalDateColumnBaseBuilder } from './date.common.ts';

export type GelTimestampTzBuilderInitial<TName extends string> = GelTimestampTzBuilder<{
	name: TName;
	dataType: 'date';
	columnType: 'GelTimestampTz';
	data: Date;
	driverParam: Date;
	enumValues: undefined;
}>;

export class GelTimestampTzBuilder<T extends ColumnBuilderBaseConfig<'date', 'GelTimestampTz'>>
	extends GelLocalDateColumnBaseBuilder<
		T
	>
{
	static override readonly [entityKind]: string = 'GelTimestampTzBuilder';

	constructor(
		name: T['name'],
	) {
		super(name, 'date', 'GelTimestampTz');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelTimestampTz(
			table,
			this.config as any,
		);
	}
}

export class GelTimestampTz<T extends ColumnBaseConfig<'date', 'GelTimestampTz'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelTimestampTz';

	constructor(table: AnyGelTable<{ name: T['tableName'] }>, config: GelTimestampTzBuilder<T>['config']) {
		super(table, config);
	}

	override mapFromDriverValue(value: unknown): Date {
		// Needed for fields nested in RQBv2's JSON
		if (typeof value === 'string') return new Date(value as string);

		return value as Date;
	}

	getSQLType(): string {
		return 'datetime';
	}
}

export function timestamptz(): GelTimestampTzBuilderInitial<''>;
export function timestamptz<TName extends string>(
	name: TName,
): GelTimestampTzBuilderInitial<TName>;
export function timestamptz(name?: string) {
	return new GelTimestampTzBuilder(name ?? '');
}
