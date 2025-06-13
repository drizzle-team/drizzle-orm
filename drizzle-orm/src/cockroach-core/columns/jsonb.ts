import type { AnyCockroachTable } from '~/cockroach-core/table.ts';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { CockroachColumn, CockroachColumnBuilder } from './common.ts';

export type CockroachJsonbBuilderInitial<TName extends string> = CockroachJsonbBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'CockroachJsonb';
	data: unknown;
	driverParam: unknown;
	enumValues: undefined;
}>;

export class CockroachJsonbBuilder<T extends ColumnBuilderBaseConfig<'json', 'CockroachJsonb'>>
	extends CockroachColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'CockroachJsonbBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'CockroachJsonb');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	): CockroachJsonb<MakeColumnConfig<T, TTableName>> {
		return new CockroachJsonb<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class CockroachJsonb<T extends ColumnBaseConfig<'json', 'CockroachJsonb'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachJsonb';

	constructor(table: AnyCockroachTable<{ name: T['tableName'] }>, config: CockroachJsonbBuilder<T>['config']) {
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

export function jsonb(): CockroachJsonbBuilderInitial<''>;
export function jsonb<TName extends string>(name: TName): CockroachJsonbBuilderInitial<TName>;
export function jsonb(name?: string) {
	return new CockroachJsonbBuilder(name ?? '');
}
