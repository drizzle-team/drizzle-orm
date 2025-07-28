import type { GeneratedColumnConfig, HasGenerated } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import type { SQL } from '~/sql/index.ts';
import { getColumnNameAndConfig, type Writable } from '~/utils.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export class SingleStoreEnumColumnBuilder<TEnum extends [string, ...string[]]> extends SingleStoreColumnBuilder<{
	name: string;
	dataType: 'string';
	data: TEnum[number];
	driverParam: string;
	enumValues: TEnum;
	generated: undefined;
}, { enumValues: TEnum }> {
	override generatedAlwaysAs(
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		as: SQL<unknown> | (() => SQL) | TEnum[number],
		// eslint-disable-next-line @typescript-eslint/no-unused-vars
		config?: Partial<GeneratedColumnConfig<unknown>>,
	): HasGenerated<this, {}> {
		throw new Error('Method not implemented.');
	}
	static override readonly [entityKind]: string = 'SingleStoreEnumColumnBuilder';

	constructor(name: string, values: TEnum) {
		super(name, 'string', 'SingleStoreEnumColumn');
		this.config.enumValues = values;
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreEnumColumn(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreEnumColumn<T extends ColumnBaseConfig<'string'>>
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
): SingleStoreEnumColumnBuilder<Writable<T>>;
export function singlestoreEnum<U extends string, T extends Readonly<[U, ...U[]]>>(
	name: string,
	values: T | Writable<T>,
): SingleStoreEnumColumnBuilder<Writable<T>>;
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
