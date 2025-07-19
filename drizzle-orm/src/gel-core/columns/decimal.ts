import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable, GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelDecimalBuilderInitial<TName extends string> = GelDecimalBuilder<{
	name: TName;
	dataType: 'string';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class GelDecimalBuilder<T extends ColumnBuilderBaseConfig<'string'>> extends GelColumnBuilder<
	T
> {
	static override readonly [entityKind]: string = 'GelDecimalBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'GelDecimal');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelDecimal(table, this.config as any);
	}
}

export class GelDecimal<T extends ColumnBaseConfig<'string'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelDecimal';

	constructor(table: AnyGelTable<{ name: T['tableName'] }>, config: GelDecimalBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'numeric';
	}
}

export function decimal(): GelDecimalBuilderInitial<''>;
export function decimal<TName extends string>(name: TName): GelDecimalBuilderInitial<TName>;
export function decimal(name?: string) {
	return new GelDecimalBuilder(name ?? '');
}
