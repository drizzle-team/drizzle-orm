import type { ColumnBaseConfig } from '~/column';
import type { ColumnBuilderBaseConfig, ColumnBuilderRuntimeConfig, MakeColumnConfig } from '~/column-builder';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/tables/common.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreVectorBuilderInitial<TName extends string> = SingleStoreVectorBuilder<{
	name: TName;
	dataType: 'array';
	columnType: 'SingleStoreVector';
	data: Array<number>;
	driverParam: Array<number>;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreVectorBuilder<T extends ColumnBuilderBaseConfig<'array', 'SingleStoreVector'>>
	extends SingleStoreColumnBuilder<T, SingleStoreVectorConfig>
{
	static readonly [entityKind]: string = 'SingleStoreVectorBuilder';

	constructor(name: T['name'], config: SingleStoreVectorConfig) {
		super(name, 'array', 'SingleStoreVector');
		this.config.dimensions = config.dimensions;
		this.config.elementType = config.elementType;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreVector<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreVector(table, this.config as ColumnBuilderRuntimeConfig<any, any>);
	}
}

export class SingleStoreVector<T extends ColumnBaseConfig<'array', 'SingleStoreVector'>> extends SingleStoreColumn<T> {
	static readonly [entityKind]: string = 'SingleStoreVector';

	readonly dimensions: number;
	readonly elementType: ElementType | undefined;

	constructor(table: AnySingleStoreTable<{ name: T['tableName'] }>, config: SingleStoreVectorBuilder<T>['config']) {
		super(table, config);
		this.dimensions = config.dimensions;
		this.elementType = config.elementType;
	}

	getSQLType(): string {
		const et = this.elementType === undefined ? '' : `, ${this.elementType}`;
		return `vector(${this.dimensions}${et})`;
	}

	override mapToDriverValue(value: Array<number>) {
		return JSON.stringify(value);
	}

	override mapFromDriverValue(value: string): Array<number> {
		return JSON.parse(value);
	}
}

type ElementType = 'I8' | 'I16' | 'I32' | 'I64' | 'F32' | 'F64';

export interface SingleStoreVectorConfig {
	dimensions: number;
	elementType: ElementType;
}

export function vector<TName extends string>(
	name: TName,
	config: SingleStoreVectorConfig,
): SingleStoreVectorBuilderInitial<TName> {
	return new SingleStoreVectorBuilder(name, config);
}
