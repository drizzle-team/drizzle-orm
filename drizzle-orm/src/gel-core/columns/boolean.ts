import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelBooleanBuilderInitial<TName extends string> = GelBooleanBuilder<{
	name: TName;
	dataType: 'boolean';
	columnType: 'GelBoolean';
	data: boolean;
	driverParam: boolean;
	enumValues: undefined;
}>;

export class GelBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'GelBoolean'>> extends GelColumnBuilder<T> {
	static override readonly [entityKind]: string = 'GelBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'GelBoolean');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelBoolean<MakeColumnConfig<T, TTableName>> {
		return new GelBoolean<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class GelBoolean<T extends ColumnBaseConfig<'boolean', 'GelBoolean'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelBoolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(): GelBooleanBuilderInitial<''>;
export function boolean<TName extends string>(name: TName): GelBooleanBuilderInitial<TName>;
export function boolean(name?: string) {
	return new GelBooleanBuilder(name ?? '');
}
