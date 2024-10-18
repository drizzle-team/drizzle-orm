import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgCompactStateAggBuilderInitial<TName extends string> = PgCompactStateAggBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgCompactStateAgg';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgCompactStateAggBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgCompactStateAgg'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgCompactStateAggBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgCompactStateAgg');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgCompactStateAgg<MakeColumnConfig<T, TTableName>> {
		return new PgCompactStateAgg<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgCompactStateAgg<T extends ColumnBaseConfig<'string', 'PgCompactStateAgg'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgCompactStateAgg';

	getSQLType(): string {
		return `compactstateagg`;
	}

	override mapFromDriverValue(value: string): string {
		return value;
	}

	override mapToDriverValue(value: string): string {
		return value;
	}
}

export function compactStateAgg<TName extends string>(
	name: TName,
): PgCompactStateAggBuilderInitial<TName> {
	return new PgCompactStateAggBuilder(name);
}
