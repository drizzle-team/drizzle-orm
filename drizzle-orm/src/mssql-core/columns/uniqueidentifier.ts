import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export class MsSqlUniqueIdentifierBuilder extends MsSqlColumnBuilder<{
	dataType: 'string uuid';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'MsSqlUniqueIdentifierBuilder';

	constructor(name: string) {
		super(name, 'string uuid', 'MsSqlUniqueIdentifier');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlUniqueIdentifier(table, this.config);
	}
}

export class MsSqlUniqueIdentifier<T extends ColumnBaseConfig<'string uuid'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlUniqueIdentifier';

	getSQLType(): string {
		return 'uniqueidentifier';
	}
}

export function uniqueidentifier(name?: string) {
	return new MsSqlUniqueIdentifierBuilder(name ?? '');
}
