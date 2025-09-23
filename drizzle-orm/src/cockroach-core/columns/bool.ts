import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export type CockroachBooleanBuilderInitial<TName extends string> = CockroachBooleanBuilder<{
	name: TName;
	dataType: 'boolean';
	columnType: 'CockroachBoolean';
	data: boolean;
	driverParam: boolean;
	enumValues: undefined;
}>;

export class CockroachBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean', 'CockroachBoolean'>>
	extends CockroachColumnWithArrayBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'CockroachBoolean');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachBoolean<MakeColumnConfig<T, TTableName>> {
		return new CockroachBoolean<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachBoolean<T extends ColumnBaseConfig<'boolean', 'CockroachBoolean'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachBoolean';

	getSQLType(): string {
		return 'bool';
	}
}

export function bool(): CockroachBooleanBuilderInitial<''>;
export function bool<TName extends string>(name: TName): CockroachBooleanBuilderInitial<TName>;
export function bool(name?: string) {
	return new CockroachBooleanBuilder(name ?? '');
}
