import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export class MsSqlJsonBuilder extends MsSqlColumnBuilder<{
	dataType: 'object json';
	data: unknown;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'MsSqlJsonBuilder';

	constructor(name: string) {
		super(name, 'object json', 'MsSqlJson');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlJson(table, this.config);
	}
}

export class MsSqlJson<T extends ColumnBaseConfig<'object json'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlJson';

	getSQLType(): string {
		return 'json';
	}

	override mapToDriverValue = (value: T['data']): string => {
		return JSON.stringify(value);
	};

	override mapFromDriverValue = (value: string): T['data'] => {
		return JSON.parse(value);
	};
}

export function json(name?: string): MsSqlJsonBuilder {
	return new MsSqlJsonBuilder(name ?? '');
}
