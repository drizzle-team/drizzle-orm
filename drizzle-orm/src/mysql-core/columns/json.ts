import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { MySqlTable } from '~/mysql-core/table.ts';
import { MySqlColumn, MySqlColumnBuilder } from './common.ts';

export class MySqlJsonBuilder extends MySqlColumnBuilder<{
	name: string;
	dataType: 'json';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'MySqlJsonBuilder';

	constructor(name: string) {
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

export function json(name?: string): MySqlJsonBuilder {
	return new MySqlJsonBuilder(name ?? '');
}
