import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySurrealDBTable } from '~/surrealdb-core/table.ts';
import { getColumnNameAndConfig } from '~/utils.ts';
import { SurrealDBColumn, SurrealDBColumnBuilder } from './common.ts';

export type SurrealDBStringBuilderInitial<TName extends string> = SurrealDBStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SurrealDBString';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SurrealDBStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'SurrealDBString'>>
	extends SurrealDBColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SurrealDBStringBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'SurrealDBString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySurrealDBTable<{ name: TTableName }>,
	): SurrealDBString<MakeColumnConfig<T, TTableName>> {
		return new SurrealDBString<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SurrealDBString<T extends ColumnBaseConfig<'string', 'SurrealDBString'>>
	extends SurrealDBColumn<T>
{
	static override readonly [entityKind]: string = 'SurrealDBString';

	getSQLType(): string {
		return 'string';
	}
}

export function string(): SurrealDBStringBuilderInitial<''>;
export function string<TName extends string>(name: TName): SurrealDBStringBuilderInitial<TName>;
export function string(name?: string): any {
	return new SurrealDBStringBuilder(name ?? '');
}
