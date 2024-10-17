import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgStateAggBuilderInitial<TName extends string> = PgStateAggBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgStateAgg';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgStateAggBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgStateAgg'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgStateAggBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgStateAgg');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgStateAgg<MakeColumnConfig<T, TTableName>> {
		return new PgStateAgg<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgStateAgg<T extends ColumnBaseConfig<'string', 'PgStateAgg'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgStateAgg';

	getSQLType(): string {
		return `stateagg`;
	}

	override mapFromDriverValue(value: string): string {
		return value;
	}

	override mapToDriverValue(value: string): string {
		return value;
	}
}

export function heartBeatAgg<TName extends string>(
	name: TName,
): PgStateAggBuilderInitial<TName> {
	return new PgStateAggBuilder(name);
}
