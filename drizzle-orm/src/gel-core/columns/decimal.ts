import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable, GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export class GelDecimalBuilder extends GelColumnBuilder<
	{
		dataType: 'string numeric';
		data: string;
		driverParam: string;
	}
> {
	static override readonly [entityKind]: string = 'GelDecimalBuilder';

	constructor(name: string) {
		super(name, 'string numeric', 'GelDecimal');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelDecimal(table, this.config as any);
	}
}

export class GelDecimal<T extends ColumnBaseConfig<'string numeric'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelDecimal';

	constructor(table: AnyGelTable<{ name: T['tableName'] }>, config: GelDecimalBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'numeric';
	}
}

export function decimal(name?: string): GelDecimalBuilder {
	return new GelDecimalBuilder(name ?? '');
}
