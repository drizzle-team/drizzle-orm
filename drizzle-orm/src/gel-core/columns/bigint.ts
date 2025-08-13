import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';

export class GelInt53Builder extends GelIntColumnBaseBuilder<{
	name: string;
	dataType: 'number integer';
	data: number;
	driverParam: number;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'GelInt53Builder';

	constructor(name: string) {
		super(name, 'number integer', 'GelInt53');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelInt53(table, this.config as any);
	}
}

export class GelInt53<T extends ColumnBaseConfig<'number integer'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelInt53';

	getSQLType(): string {
		return 'bigint';
	}
}

export function bigint(name?: string): GelInt53Builder {
	return new GelInt53Builder(name ?? '');
}
