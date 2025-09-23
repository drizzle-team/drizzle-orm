import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export class MsSqlRealBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'number float';
	data: number;
	driverParam: number;
}> {
	static override readonly [entityKind]: string = 'MsSqlRealBuilder';

	constructor(name: string) {
		super(name, 'number float', 'MsSqlReal');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlReal(table, this.config);
	}
}

export class MsSqlReal<T extends ColumnBaseConfig<'number float'>> extends MsSqlColumnWithIdentity<T> {
	static override readonly [entityKind]: string = 'MsSqlReal';

	getSQLType(): string {
		return 'real';
	}
}

export function real(name?: string) {
	return new MsSqlRealBuilder(name ?? '');
}
