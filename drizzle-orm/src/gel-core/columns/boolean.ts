import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export class GelBooleanBuilder extends GelColumnBuilder<{
	dataType: 'boolean';
	data: boolean;
	driverParam: boolean;
}> {
	static override readonly [entityKind]: string = 'GelBooleanBuilder';

	constructor(name: string) {
		super(name, 'boolean', 'GelBoolean');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelBoolean(table, this.config as any);
	}
}

export class GelBoolean<T extends ColumnBaseConfig<'boolean'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelBoolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(name?: string): GelBooleanBuilder {
	return new GelBooleanBuilder(name ?? '');
}
