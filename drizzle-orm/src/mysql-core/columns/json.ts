import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export type MySqlJsonBuilderInitial<TName extends string> = MySqlJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'MySqlJson';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
}>;

export class MySqlJsonBuilder<T extends ColumnBuilderBaseConfig<'json'>> extends MySqlColumnBuilder<T> {
	static override readonly [entityKind]: string = 'MySqlJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'MySqlJson');
	}

	/** @internal */
	override build(table: MySqlTable) {
		return new MySqlJson(table, this.config as any);
	}
}

export class MySqlJson<T extends ColumnBaseConfig<'json'>> extends MySqlColumn<T> {
	static override readonly [entityKind]: string = 'MySqlJson';

	getSQLType(): string {
		return 'json';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export function json(): MySqlJsonBuilderInitial<''>;
export function json<TName extends string>(name: TName): MySqlJsonBuilderInitial<TName>;
export function json(name?: string) {
	return new MySqlJsonBuilder(name ?? '');
}
