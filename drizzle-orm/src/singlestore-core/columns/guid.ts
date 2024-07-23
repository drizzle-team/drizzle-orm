import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table';
import { sql } from '~/sql/sql.ts';
import type { Equal } from '~/utils';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreGUIDBuilderInitial<TName extends string> = SingleStoreGUIDBuilder<{
	name: TName;
	dataType: 'buffer';
	columnType: 'SingleStoreGUID';
	data: Uint8Array;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreGUIDBuilder<T extends ColumnBuilderBaseConfig<'buffer', 'SingleStoreGUID'>>
	extends SingleStoreColumnBuilder<T, SingleStoreGUIDConfig>
{
	static readonly [entityKind]: string = 'SingleStoreGUIDBuilder';

	constructor(name: T['name'], _config?: SingleStoreGUIDConfig) {
		super(name, 'buffer', 'SingleStoreGUID');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreGUID<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreGUID(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SingleStoreGUID<T extends ColumnBaseConfig<'buffer', 'SingleStoreGUID'>> extends SingleStoreColumn<T> {
	static readonly [entityKind]: string = 'SingleStoreGUID';

	constructor(table: AnySingleStoreTable<{ name: T['tableName'] }>, config: SingleStoreGUIDBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'binary(16)';
	}

	override mapToDriverValue(value: string) {
		return sql`UNHEX(REPLACE(${value}, "-", ""))`;
	}
}

export type SingleStoreGUIDStringBuilderInitial<TName extends string> = SingleStoreGUIDStringBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'SingleStoreGUIDString';
	data: string;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreGUIDStringBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreGUIDString'>>
	extends SingleStoreColumnBuilder<T, SingleStoreGUIDConfig>
{
	static readonly [entityKind]: string = 'SingleStoreGUIDStringBuilder';

	constructor(name: T['name'], _config?: SingleStoreGUIDConfig) {
		super(name, 'string', 'SingleStoreGUIDString');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreGUIDString<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreGUIDString(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SingleStoreGUIDString<T extends ColumnBaseConfig<'string', 'SingleStoreGUIDString'>>
	extends SingleStoreColumn<T>
{
	static readonly [entityKind]: string = 'SingleStoreGUIDString';

	constructor(table: AnySingleStoreTable<{ name: T['tableName'] }>, config: SingleStoreGUIDStringBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'binary(16)';
	}

	override mapToDriverValue(value: string) {
		return sql`UNHEX(REPLACE(${value}, "-", ""))`;
	}

	override mapFromDriverValue(value: Uint8Array): string {
		const hex = Buffer.from(value).toString('hex');
		return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
	}
}

export interface SingleStoreGUIDConfig<TMode extends 'string' | 'buffer' = 'string' | 'buffer'> {
	mode?: TMode;
}

/**
 * Creates a column with the data type `BINARY(16)`
 *
 * Use config `{ mode: "string" }` for a string representation of the GUID
 */
export function guid<TName extends string, TMode extends SingleStoreGUIDConfig['mode'] & {}>(
	name: TName,
	config?: SingleStoreGUIDConfig<TMode>,
): Equal<TMode, 'string'> extends true ? SingleStoreGUIDStringBuilderInitial<TName>
	: SingleStoreGUIDBuilderInitial<TName>;
export function guid(name: string, config?: SingleStoreGUIDConfig) {
	if (config?.mode === 'string') {
		return new SingleStoreGUIDStringBuilder(name, config);
	}
	return new SingleStoreGUIDBuilder(name, config);
}
