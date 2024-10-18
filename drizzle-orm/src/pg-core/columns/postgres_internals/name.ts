import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from '../common.ts';

export type PgNameInternalBuilderInitial<TName extends string> = PgNameInternalBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgNameInternal';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class PgNameInternalBuilder<T extends ColumnBuilderBaseConfig<'string', 'PgNameInternal'>>
	extends PgColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'PgNameInternalBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgNameInternal');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgNameInternal<MakeColumnConfig<T, TTableName>> {
		return new PgNameInternal<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class PgNameInternal<T extends ColumnBaseConfig<'string', 'PgNameInternal'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgNameInternal';

	getSQLType(): string {
		return `name`;
	}

	override mapFromDriverValue(value: string): string {
		return value;
	}

	override mapToDriverValue(value: string): string {
		return value;
	}
}

export function name<TName extends string>(
	name: TName,
): PgNameInternalBuilderInitial<TName> {
	return new PgNameInternalBuilder(name);
}
