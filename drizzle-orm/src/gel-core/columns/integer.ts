import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '../table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';

export class GelIntegerBuilder extends GelIntColumnBaseBuilder<{
	name: string;
	dataType: 'number integer';
	data: number;
	driverParam: number;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'GelIntegerBuilder';

	constructor(name: string) {
		super(name, 'number integer', 'GelInteger');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelInteger(table, this.config as any);
	}
}

export class GelInteger<T extends ColumnBaseConfig<'number integer'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelInteger';

	getSQLType(): string {
		return 'integer';
	}
}

export function integer(name?: string): GelIntegerBuilder {
	return new GelIntegerBuilder(name ?? '');
}
