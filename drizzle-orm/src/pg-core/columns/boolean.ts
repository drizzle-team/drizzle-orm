import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgBooleanBuilder extends PgColumnBuilder<{
	dataType: 'boolean';
	data: boolean;
	driverParam: boolean;
}> {
	static override readonly [entityKind]: string = 'PgBooleanBuilder';

	constructor(name: string) {
		super(name, 'boolean', 'PgBoolean');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgBoolean(table, this.config as any);
	}
}

export class PgBoolean extends PgColumn<'boolean'> {
	static override readonly [entityKind]: string = 'PgBoolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(name?: string): PgBooleanBuilder {
	return new PgBooleanBuilder(name ?? '');
}
