import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgJsonBuilderInitial<TName extends string> = PgJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'PgJson';
	data: unknown;
	driverParam: unknown;
	enumValues: undefined;
}>;

export class PgJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgJson'>> extends PgColumnBuilder<
	T
> {
	static override readonly [entityKind]: string = 'PgJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'PgJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyPgTable<{ name: TTableName }>,
	): PgJson<MakeColumnConfig<T, TTableName>> {
		return new PgJson<MakeColumnConfig<T, TTableName>>(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class PgJson<T extends ColumnBaseConfig<'json', 'PgJson'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgJson';

	constructor(table: AnyPgTable<{ name: T['tableName'] }>, config: PgJsonBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'json';
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

export function json(): PgJsonBuilderInitial<''>;
export function json<TName extends string>(name: TName): PgJsonBuilderInitial<TName>;
export function json(name?: string) {
	return new PgJsonBuilder(name ?? '');
}
