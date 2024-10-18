import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgOidInternalBuilderInitial<TName extends string> = PgOidInternalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgOidInternal';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgOidInternalBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgOidInternal'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgOidInternalBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgOidInternal');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgOidInternal<MakeColumnConfig<T, TTableName>> {
		return new PgOidInternal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgOidInternal<T extends ColumnBaseConfig<'string', 'PgOidInternal'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgOidInternal';

	getSQLType(): string {
		return `oid`;
	}

	override mapFromDriverValue(value: string): string {
		return value;
	}

	override mapToDriverValue(value: string): string {
		return value;
	}
}

export function oid<TName extends string>(
	name: TName,
): PgOidInternalBuilderInitial<TName> {
	return new PgOidInternalBuilder(name);
}
