import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgMacaddrBuilderInitial<TName extends string> = PgMacaddrBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgMacaddr';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgMacaddrBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgMacaddr'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgMacaddrBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgMacaddr');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgMacaddr<MakeColumnConfig<T, TTableName>> {
		return new PgMacaddr<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgMacaddr<T extends ColumnBaseConfig<'string', 'PgMacaddr'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgMacaddr';

	getSQLType(): string {
		return 'macaddr';
	}
}

export function macaddr(): PgMacaddrBuilderInitial<''>;
export function macaddr<TName extends string>(name: TName): PgMacaddrBuilderInitial<TName>;
export function macaddr(name?: string) {
	return new PgMacaddrBuilder(name ?? '');
}
