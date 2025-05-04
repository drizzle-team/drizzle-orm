import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelJsonBuilderInitial<TName extends string> = GelJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'GelJson';
	data: unknown;
	driverParam: unknown;
	enumValues: undefined;
}>;

export class GelJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'GelJson'>> extends GelColumnBuilder<
	T
> {
	static override readonly [entityKind]: string = 'GelJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'GelJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyGelTable<{ name: TTableName }>,
	): GelJson<MakeColumnConfig<T, TTableName>> {
		return new GelJson<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class GelJson<T extends ColumnBaseConfig<'json', 'GelJson'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelJson';

	constructor(table: AnyGelTable<{ name: T['tableName'] }>, config: GelJsonBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'json';
	}
}

export function json(): GelJsonBuilderInitial<''>;
export function json<TName extends string>(name: TName): GelJsonBuilderInitial<TName>;
export function json(name?: string) {
	return new GelJsonBuilder(name ?? '');
}
