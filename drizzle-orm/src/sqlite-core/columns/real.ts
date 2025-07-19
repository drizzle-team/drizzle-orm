import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQLiteTable } from '../table.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export type SQLiteRealBuilderInitial<TName extends string> = SQLiteRealBuilder<{
	name: TName;
	dataType: 'number';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class SQLiteRealBuilder<T extends ColumnBuilderBaseConfig<'number'>>
	extends SQLiteColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SQLiteRealBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'SQLiteReal');
	}

	/** @internal */
	override build(table: SQLiteTable) {
		return new SQLiteReal(table, this.config as any);
	}
}

export class SQLiteReal<T extends ColumnBaseConfig<'number'>> extends SQLiteColumn<T> {
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
