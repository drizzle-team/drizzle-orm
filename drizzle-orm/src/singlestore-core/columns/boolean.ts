import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreBooleanBuilderInitial<TName extends string> = SingleStoreBooleanBuilder<{
	name: TName;
	dataType: 'boolean';
	columnType: 'SingleStoreBoolean';
	data: boolean;
	driverParam: number | boolean;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'SingleStoreBoolean'>>
	extends SingleStoreColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SingleStoreBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'SingleStoreBoolean');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreBoolean<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreBoolean<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreBoolean<T extends ColumnBaseConfig<'boolean', 'SingleStoreBoolean'>>
	extends SingleStoreColumn<T>
{
	static override readonly [entityKind]: string = 'SingleStoreBoolean';

	getSQLType(): string {
		return 'boolean';
	}

	override mapFromDriverValue(value: number | boolean): boolean {
		if (typeof value === 'boolean') {
			return value;
		}
		return value === 1;
	}
}

export function boolean(): SingleStoreBooleanBuilderInitial<''>;
export function boolean<TName extends string>(name: TName): SingleStoreBooleanBuilderInitial<TName>;
export function boolean(name?: string) {
	return new SingleStoreBooleanBuilder(name ?? '');
}
