import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export class MsSqlTinyIntBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'number uint8';
	data: number;
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'MsSqlTinyIntBuilder';

	constructor(name: string) {
		super(name, 'number uint8', 'MsSqlTinyInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlTinyInt(
			table,
			this.config,
		);
	}
}

export class MsSqlTinyInt<T extends ColumnBaseConfig<'number uint8'>> extends MsSqlColumnWithIdentity<T> {
	static override readonly [entityKind]: string = 'MsSqlTinyInt';

	getSQLType(): string {
		return `tinyint`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function tinyint(name?: string) {
	return new MsSqlTinyIntBuilder(name ?? '');
}
