import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySurrealDBTable } from '~/surrealdb-core/table.ts';
import { SurrealDBColumn, SurrealDBColumnBuilder } from './common.ts';

export type SurrealDBObjectBuilderInitial<TName extends string> = SurrealDBObjectBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'SurrealDBObject';
	data: Record<string, unknown>;
	driverParam: Record<string, unknown>;
	enumValues: undefined;
	generated: undefined;
}>;

export class SurrealDBObjectBuilder<T extends ColumnBuilderBaseConfig<'json', 'SurrealDBObject'>>
	extends SurrealDBColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SurrealDBObjectBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'SurrealDBObject');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySurrealDBTable<{ name: TTableName }>,
	): SurrealDBObject<MakeColumnConfig<T, TTableName>> {
		return new SurrealDBObject<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SurrealDBObject<T extends ColumnBaseConfig<'json', 'SurrealDBObject'>>
	extends SurrealDBColumn<T>
{
	static override readonly [entityKind]: string = 'SurrealDBObject';

	getSQLType(): string {
		return 'object';
	}
}

export function object(): SurrealDBObjectBuilderInitial<''>;
export function object<TName extends string>(name: TName): SurrealDBObjectBuilderInitial<TName>;
export function object(name?: string): any {
	return new SurrealDBObjectBuilder(name ?? '');
}
