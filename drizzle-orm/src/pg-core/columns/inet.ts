import type { ColumnBaseConfig } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity';
import type { AnyPgTable } from '../table';
import { PgColumn, PgColumnBuilder } from './common';

export type PgInetBuilderInitial<TName extends string> = PgInetBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgInet';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgInetBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgInet'>> extends PgColumnBuilder<T> {
	static readonly [entityKind]: string = 'PgInetBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgInet');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgInet<MakeColumnConfig<T, TTableName>> {
		return new PgInet<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgInet<T extends ColumnBaseConfig<'string', 'PgInet'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgInet';

	getSQLType(): string {
		return 'inet';
	}
}

export function inet<TName extends string>(name: TName): PgInetBuilderInitial<TName> {
	return new PgInetBuilder(name);
}
