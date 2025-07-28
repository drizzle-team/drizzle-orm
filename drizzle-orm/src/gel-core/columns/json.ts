import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable, GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export class GelJsonBuilder extends GelColumnBuilder<
	{
		name: string;
		dataType: 'json';
		data: unknown;
		driverParam: unknown;
		enumValues: undefined;
	}
> {
	static override readonly [entityKind]: string = 'GelJsonBuilder';

	constructor(name: string) {
		super(name, 'json', 'GelJson');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelJson(table, this.config as any);
	}
}

export class GelJson<T extends ColumnBaseConfig<'json'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelJson';

	constructor(table: AnyGelTable<{ name: T['tableName'] }>, config: GelJsonBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'json';
	}
}

export function json(name?: string): GelJsonBuilder {
	return new GelJsonBuilder(name ?? '');
}
