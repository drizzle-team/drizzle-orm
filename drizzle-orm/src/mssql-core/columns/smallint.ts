import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumnBuilderWithIdentity, MsSqlColumnWithIdentity } from './common.ts';

export class MsSqlSmallIntBuilder extends MsSqlColumnBuilderWithIdentity<{
	dataType: 'number int16';
	data: number;
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'MsSqlSmallIntBuilder';

	constructor(name: string) {
		super(name, 'number int16', 'MsSqlSmallInt');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlSmallInt(
			table,
			this.config,
		);
	}
}

export class MsSqlSmallInt<T extends ColumnBaseConfig<'number int16'>> extends MsSqlColumnWithIdentity<T> {
	static override readonly [entityKind]: string = 'MsSqlSmallInt';

	getSQLType(): string {
		return `smallint`;
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function smallint(name?: string) {
	return new MsSqlSmallIntBuilder(name ?? '');
}
