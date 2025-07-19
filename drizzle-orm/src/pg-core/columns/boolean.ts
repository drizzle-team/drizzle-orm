import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type {  PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgBooleanBuilder<TName extends string> extends PgColumnBuilder<{
	name: TName;
	dataType: 'boolean';
	data: boolean;
	driverParam: boolean;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'PgBooleanBuilder';

	constructor(name: string) {
		super(name, 'boolean', 'PgBoolean');
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgBoolean(table, this.config as any);
	}
}

export class PgBoolean extends PgColumn<ColumnBaseConfig<'boolean'>> {
	static override readonly [entityKind]: string = 'PgBoolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(): PgBooleanBuilder<''>;
export function boolean<TName extends string>(name: TName): PgBooleanBuilder<TName>;
export function boolean(name?: string) {
	return new PgBooleanBuilder(name ?? '');
}
