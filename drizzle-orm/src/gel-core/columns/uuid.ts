import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export class GelUUIDBuilder extends GelColumnBuilder<{
	dataType: 'string uuid';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'GelUUIDBuilder';

	constructor(name: string) {
		super(name, 'string uuid', 'GelUUID');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelUUID(table, this.config as any);
	}
}

export class GelUUID<T extends ColumnBaseConfig<'string uuid'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelUUID';

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid(name?: string): GelUUIDBuilder {
	return new GelUUIDBuilder(name ?? '');
}
