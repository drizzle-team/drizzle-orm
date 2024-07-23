import type { ColumnBaseConfig } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreUUIDBuilderInitial<TName extends string> = SingleStoreUUIDBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreUUID';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreUUIDBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreUUID'>>
	extends SingleStoreColumnBuilder<T>
{
	static readonly [entityKind]: string = 'SingleStoreUUIDBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'SingleStoreUUID');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreUUID<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreUUID(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SingleStoreUUID<T extends ColumnBaseConfig<'string', 'SingleStoreUUID'>> extends SingleStoreColumn<T> {
	static readonly [entityKind]: string = 'SingleStoreUUID';

	constructor(table: AnySingleStoreTable<{ name: T['tableName'] }>, config: SingleStoreUUIDBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'varchar(36)';
	}
}

export function uuid<TName extends string>(name: TName): SingleStoreUUIDBuilderInitial<TName> {
	return new SingleStoreUUIDBuilder(name);
}
