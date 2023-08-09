import type { ColumnBaseConfig } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export type PgCidrBuilderInitial<TName extends string> = PgCidrBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgCidr';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgCidrBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgCidr'>> extends PgColumnBuilder<T> {
	static readonly [entityKind]: string = 'PgCidrBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgCidr');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgCidr<MakeColumnConfig<T, TTableName>> {
		return new PgCidr<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgCidr<T extends ColumnBaseConfig<'string', 'PgCidr'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgCidr';

	getSQLType(): string {
		return 'cidr';
	}
}

export function cidr<TName extends string>(name: TName): PgCidrBuilderInitial<TName> {
	return new PgCidrBuilder(name);
}
