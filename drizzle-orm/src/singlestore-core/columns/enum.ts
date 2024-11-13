import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	GeneratedColumnConfig,
	HasGenerated,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnySingleStoreTable } from '~/singlestore-core/table.ts';
import type { SQL } from '~/sql/index.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreEnumColumnBuilderInitial<TName extends string, TEnum extends [string, ...string[]]> =
	SingleStoreEnumColumnBuilder<{
		name: TName;
		dataType: 'string';
		columnType: 'SingleStoreEnumColumn';
		data: TEnum[number];
		driverParam: string;
		enumValues: TEnum;
		generated: undefined;
	}>;

export class SingleStoreEnumColumnBuilder<T extends ColumnBuilderBaseConfig<'string', 'SingleStoreEnumColumn'>>
	extends SingleStoreColumnBuilder<T, { enumValues: T['enumValues'] }>
{
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	override generatedAlwaysAs(
		as: SQL<unknown> | (() => SQL) | T['data'],
		config?: Partial<GeneratedColumnConfig<unknown>>,
	): HasGenerated<this, {}> {
		throw new Error('Method not implemented.');
	}
	static override readonly [entityKind]: string = 'SingleStoreEnumColumnBuilder';

	constructor(name: T['name'], values: T['enumValues']) {
		super(name, 'string', 'SingleStoreEnumColumn');
		this.config.enumValues = values;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreEnumColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }> {
		return new SingleStoreEnumColumn<MakeColumnConfig<T, TTableName> & { enumValues: T['enumValues'] }>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
		);
	}
}

export class SingleStoreEnumColumn<T extends ColumnBaseConfig<'string', 'SingleStoreEnumColumn'>>
	extends SingleStoreColumn<T, { enumValues: T['enumValues'] }>
{
	static override readonly [entityKind]: string = 'SingleStoreEnumColumn';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return `enum(${this.enumValues!.map((value) => `'${value}'`).join(',')})`;
	}
}

export function singlestoreEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	values: T | Writable<T>,
): SingleStoreEnumColumnBuilderInitial<'', Writable<T>>;
export function singlestoreEnum<TName extends string, U extends string, T extends Readonly<[U, ...U[]]>>(
	name: TName,
	values: T | Writable<T>,
): SingleStoreEnumColumnBuilderInitial<TName, Writable<T>>;
export function singlestoreEnum(
	a?: string | readonly [string, ...string[]] | [string, ...string[]],
	b?: readonly [string, ...string[]] | [string, ...string[]],
): any {
	const { name, config: values } = getColumnNameAndConfig<readonly [string, ...string[]] | [string, ...string[]]>(a, b);

	if (values.length === 0) {
		throw new Error(`You have an empty array for "${name}" enum values`);
	}

	return new SingleStoreEnumColumnBuilder(name, values as any);
}
