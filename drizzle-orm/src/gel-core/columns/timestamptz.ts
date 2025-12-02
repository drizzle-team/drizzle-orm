import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable, GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelLocalDateColumnBaseBuilder } from './date.common.ts';

export class GelTimestampTzBuilder extends GelLocalDateColumnBaseBuilder<
	{
		dataType: 'object date';
		data: Date;
		driverParam: Date;
	}
> {
	static override readonly [entityKind]: string = 'GelTimestampTzBuilder';

	constructor(
		name: string,
	) {
		super(name, 'object date', 'GelTimestampTz');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelTimestampTz(
			table,
			this.config as any,
		);
	}
}

export class GelTimestampTz<T extends ColumnBaseConfig<'object date'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelTimestampTz';

	constructor(table: AnyGelTable<{ name: T['tableName'] }>, config: GelTimestampTzBuilder['config']) {
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

export function timestamptz(name?: string): GelTimestampTzBuilder {
	return new GelTimestampTzBuilder(name ?? '');
}
