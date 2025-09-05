import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export class MsSqlIntBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'number int32';
	data: number;
	driverParam: number;
}> {
	static override readonly [entityKind]: string = 'MsSqlIntBuilder';

	constructor(name: string) {
		super(name, 'number int32', 'MsSqlInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlInt(table, this.config);
	}
}

export class MsSqlInt<T extends ColumnBaseConfig<'number int32'>> extends MsSqlColumnWithIdentity<T> {
	static override readonly [entityKind]: string = 'MsSqlInt';

	getSQLType(): string {
		return `int`;
	}
}

export function int(name?: string) {
	return new MsSqlIntBuilder(name ?? '');
}
