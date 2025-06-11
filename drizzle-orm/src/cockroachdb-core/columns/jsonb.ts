import type { AnyCockroachDbTable } from '~/cockroachdb-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachDbColumn, CockroachDbColumnBuilder } from './common.ts';

export type CockroachDbJsonbBuilderInitial<TName extends string> = CockroachDbJsonbBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'CockroachDbJsonb';
	data: unknown;
	driverParam: unknown;
	enumValues: undefined;
}>;

export class CockroachDbJsonbBuilder<T extends ColumnBuilderBaseConfig<'json', 'CockroachDbJsonb'>>
	extends CockroachDbColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachDbJsonbBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'CockroachDbJsonb');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachDbTable<{ name: TTableName }>,
	): CockroachDbJsonb<MakeColumnConfig<T, TTableName>> {
		return new CockroachDbJsonb<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachDbJsonb<T extends ColumnBaseConfig<'json', 'CockroachDbJsonb'>> extends CockroachDbColumn<T> {
	static override readonly [entityKind]: string = 'CockroachDbJsonb';

	constructor(table: AnyCockroachDbTable<{ name: T['tableName'] }>, config: CockroachDbJsonbBuilder<T>['config']) {
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

export function jsonb(): CockroachDbJsonbBuilderInitial<''>;
export function jsonb<TName extends string>(name: TName): CockroachDbJsonbBuilderInitial<TName>;
export function jsonb(name?: string) {
	return new CockroachDbJsonbBuilder(name ?? '');
}
