import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgJsonbBuilderInitial<TName extends string> = PgJsonbBuilder<
	{
		name: TName;
		dataType: 'json';
		columnType: 'PgJsonb';
		data: unknown;
		driverParam: unknown;
		enumValues: undefined;
		generated: undefined;
	}
>;

export class PgJsonbBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgJsonb'>> extends PgColumnBuilder<T> {
	static readonly [entityKind]: string = 'PgJsonbBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'PgJsonb');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgJsonb<MakeColumnConfig<T, TTableName>> {
		return new PgJsonb<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgJsonb<T extends ColumnBaseConfig<'json', 'PgJsonb'>> extends PgColumn<T> {
	static readonly [entityKind]: string = 'PgJsonb';

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgJsonbBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'jsonb';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}

	override mapFromDriverValue(value: T['data'] | string): T['data'] {
		if (typeof value === 'string') {
			try {
				return JSON.parse(value);
			} catch {
				return value as T['data'];
			}
		}
		return value;
	}
}

export function jsonb<TName extends string>(name: TName): PgJsonbBuilderInitial<TName> {
	return new PgJsonbBuilder(name);
}
