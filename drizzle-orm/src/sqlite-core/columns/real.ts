import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SQLiteTable } from '../table.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from './common.ts';

export class SQLiteRealBuilder extends SQLiteColumnBuilder<{
	name: string;
	dataType: 'number';
	data: number;
	driverParam: number;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'SQLiteRealBuilder';

	constructor(name: string) {
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

export function real(name?: string): SQLiteRealBuilder {
	return new SQLiteRealBuilder(name ?? '');
}
