import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';


export class GelInt53Builder<TName extends string> extends GelIntColumnBaseBuilder<{
	name: TName;
	dataType: 'number';
	data: number;
	driverParam: number;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'GelInt53Builder';

	constructor(name: string) {
		super(name, 'number', 'GelInt53');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelInt53(table, this.config as any);
	}
}

export class GelInt53 extends GelColumn<ColumnBaseConfig<'number'>> {
	static override readonly [entityKind]: string = 'GelInt53';

	getSQLType(): string {
		return 'bigint';
	}
}

export function bigint(): GelInt53Builder<''>;
export function bigint<TName extends string>(name: TName): GelInt53Builder<TName>;
export function bigint(name?: string) {
	return new GelInt53Builder(name ?? '');
}
