import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyPgTable, PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgJsonbBuilderInitial<TName extends string> = PgJsonbBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'PgJsonb';
	data: unknown;
	driverParam: unknown;
	enumValues: undefined;
}>;

export class PgJsonbBuilder<T extends ColumnBuilderBaseConfig<'json', 'PgJsonb'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgJsonbBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'PgJsonb');
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgJsonb(table, this.config as any);
	}
}

export class PgJsonb<T extends ColumnBaseConfig<'json', 'PgJsonb'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgJsonb';

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

export function jsonb(): PgJsonbBuilderInitial<''>;
export function jsonb<TName extends string>(name: TName): PgJsonbBuilderInitial<TName>;
export function jsonb(name?: string) {
	return new PgJsonbBuilder(name ?? '');
}
