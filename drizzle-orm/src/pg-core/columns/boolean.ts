import type { ColumnBuilderBaseConfig} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type {  PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgBooleanBuilderInitial<TName extends string> = PgBooleanBuilder<{
	name: TName;
	dataType: 'boolean';
	columnType: 'PgBoolean';
	data: boolean;
	driverParam: boolean;
	enumValues: undefined;
}>;

export class PgBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'PgBoolean'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'PgBoolean');
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgBoolean(table, this.config as any);
	}
}

export class PgBoolean<T extends ColumnBaseConfig<'boolean', 'PgBoolean'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgBoolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(): PgBooleanBuilderInitial<''>;
export function boolean<TName extends string>(name: TName): PgBooleanBuilderInitial<TName>;
export function boolean(name?: string) {
	return new PgBooleanBuilder(name ?? '');
}
