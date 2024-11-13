import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
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
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgBoolean<MakeColumnConfig<T, TTableName>> {
		return new PgBoolean<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
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
