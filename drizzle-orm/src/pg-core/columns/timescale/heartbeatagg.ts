import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgHeartBeatAggBuilderInitial<TName extends string> = PgHeartBeatAggBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgHeartBeatAgg';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgHeartBeatAggBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgHeartBeatAgg'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgHeartBeatAggBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgHeartBeatAgg');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgHeartBeatAgg<MakeColumnConfig<T, TTableName>> {
		return new PgHeartBeatAgg<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgHeartBeatAgg<T extends ColumnBaseConfig<'string', 'PgHeartBeatAgg'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgHeartBeatAgg';

	getSQLType(): string {
		return `heartbeatagg`;
	}

	override mapFromDriverValue(value: string): string {
		return value;
	}

	override mapToDriverValue(value: string): string {
		return value;
	}
}

export function heartbeatagg(): PgHeartBeatAggBuilderInitial<''>;
export function heartbeatagg<TName extends string>(name: TName): PgHeartBeatAggBuilderInitial<TName>;
export function heartbeatagg(name?: string) {
	return new PgHeartBeatAggBuilder(name ?? '');
}
