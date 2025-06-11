import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachDbColumn, CockroachDbColumnWithArrayBuilder } from './common.ts';

export type CockroachDbBooleanBuilderInitial<TName extends string> = CockroachDbBooleanBuilder<{
	name: TName;
	dataType: 'boolean';
	columnType: 'CockroachDbBoolean';
	data: boolean;
	driverParam: boolean;
	enumValues: undefined;
}>;

export class CockroachDbBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'CockroachDbBoolean'>>
	extends CockroachDbColumnWithArrayBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'CockroachDbBoolean');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbBoolean<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbBoolean<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbBoolean<T extends ColumnBaseConfig<'boolean', 'CockroachDbBoolean'>>
	extends CockroachDbColumn<T>
{
	static override readonly [entityKind]: string = 'CockroachDbBoolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(): CockroachDbBooleanBuilderInitial<''>;
export function boolean<TName extends string>(name: TName): CockroachDbBooleanBuilderInitial<TName>;
export function boolean(name?: string) {
	return new CockroachDbBooleanBuilder(name ?? '');
}
