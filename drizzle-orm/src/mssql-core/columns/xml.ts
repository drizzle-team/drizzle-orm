import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export class MsSqlXmlBuilder extends MsSqlColumnBuilder<{
	dataType: 'string';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'MsSqlXmlBuilder';

	constructor(name: string) {
		super(name, 'string', 'MsSqlXml');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlXml(table, this.config);
	}
}

export class MsSqlXml<T extends ColumnBaseConfig<'string'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlXml';

	getSQLType(): string {
		return 'xml';
	}
}

export function xml(name?: string) {
	return new MsSqlXmlBuilder(name ?? '');
}
