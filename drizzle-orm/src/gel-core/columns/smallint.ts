import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';

export class GelSmallIntBuilder extends GelIntColumnBaseBuilder<{
	dataType: 'number int16';
	data: number;
	driverParam: number;
}> {
	static override readonly [entityKind]: string = 'GelSmallIntBuilder';

	constructor(name: string) {
		super(name, 'number int16', 'GelSmallInt');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelSmallInt(table, this.config as any);
	}
}

export class GelSmallInt<T extends ColumnBaseConfig<'number int16' | 'number uint16'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelSmallInt';

	getSQLType(): string {
		return 'smallint';
	}
}

export function smallint(name?: string): GelSmallIntBuilder {
	return new GelSmallIntBuilder(name ?? '');
}
