import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySQLiteTable } from '../table.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export type SQLiteRealBuilderInitial<TName extends string> = SQLiteRealBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'SQLiteReal';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class SQLiteRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'SQLiteReal'>>
	extends SQLiteColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SQLiteRealBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'SQLiteReal');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteReal<MakeColumnConfig<T, TTableName>> {
		return new SQLiteReal<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SQLiteReal<T extends ColumnBaseConfig<'number', 'SQLiteReal'>> extends SQLiteColumn<T> {
	static override readonly [entityKind]: string = 'SQLiteReal';

	getSQLType(): string {
		return 'real';
	}
}

export function real(): SQLiteRealBuilderInitial<''>;
export function real<TName extends string>(name: TName): SQLiteRealBuilderInitial<TName>;
export function real(name?: string) {
	return new SQLiteRealBuilder(name ?? '');
}
