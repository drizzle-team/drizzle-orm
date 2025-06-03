import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachDbColumn, CockroachDbColumnBuilder } from './common.ts';

export type CockroachDbJsonBuilderInitial<TName extends string> = CockroachDbJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'CockroachDbJson';
	data: unknown;
	driverParam: unknown;
	enumValues: undefined;
}>;

export class CockroachDbJsonBuilder<T extends ColumnBuilderBaseConfig<'json', 'CockroachDbJson'>>
	extends CockroachDbColumnBuilder<
		T
	>
{
	static override readonly [entityKind]: string = 'CockroachDbJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'CockroachDbJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbJson<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbJson<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbJson<T extends ColumnBaseConfig<'json', 'CockroachDbJson'>> extends CockroachDbColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDbJson';

	constructor(table: AnyCockroachDbTable<{ name: T['tableName'] }>, config: CockroachDbJsonBuilder<T>['config']) {
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

export function json(): CockroachDbJsonBuilderInitial<''>;
export function json<TName extends string>(name: TName): CockroachDbJsonBuilderInitial<TName>;
export function json(name?: string) {
	return new CockroachDbJsonBuilder(name ?? '');
}
