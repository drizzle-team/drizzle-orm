import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export class MsSqlBitBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'boolean';
	data: boolean;
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'MsSqlBitBuilder';

	constructor(name: string) {
		super(name, 'boolean', 'MsSqlBit');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlBit(table, this.config);
	}
}

export class MsSqlBit<T extends ColumnBaseConfig<'boolean'>> extends MsSqlColumnWithIdentity<T> {
	static override readonly [entityKind]: string = 'MsSqlBit';

	getSQLType(): string {
		return `bit`;
	}

	override mapFromDriverValue = Boolean;
}

export function bit(name?: string) {
	return new MsSqlBitBuilder(name ?? '');
}
