import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgBooleanBuilder extends PgColumnBuilder<{
	name: string;
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

export class PgBoolean<T extends ColumnBaseConfig<'boolean'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgBoolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(name?: string): PgBooleanBuilder {
	return new PgBooleanBuilder(name ?? '');
}
