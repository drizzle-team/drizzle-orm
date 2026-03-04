import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '../table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';

export class GelIntegerBuilder extends GelIntColumnBaseBuilder<{
	dataType: 'number int32';
	data: number;
	driverParam: number;
}> {
	static override readonly [entityKind]: string = 'GelIntegerBuilder';

	constructor(name: string) {
		super(name, 'number int32', 'GelInteger');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelInteger(table, this.config as any);
	}
}

export class GelInteger<T extends ColumnBaseConfig<'number int32' | 'number uint32'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelInteger';

	getSQLType(): string {
		return 'integer';
	}
}

export function integer(name?: string): GelIntegerBuilder {
	return new GelIntegerBuilder(name ?? '');
}
