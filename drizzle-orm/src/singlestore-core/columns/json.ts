import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { SingleStoreTable } from '~/singlestore-core/table.ts';
import { SingleStoreColumn, SingleStoreColumnBuilder } from './common.ts';

export type SingleStoreJsonBuilderInitial<TName extends string> = SingleStoreJsonBuilder<{
	name: TName;
	dataType: 'json';
	columnType: 'SingleStoreJson';
	data: unknown;
	driverParam: string;
	enumValues: undefined;
	generated: undefined;
}>;

export class SingleStoreJsonBuilder<T extends ColumnBuilderBaseConfig<'json'>>
	extends SingleStoreColumnBuilder<T>
{
	static override readonly [entityKind]: string = 'SingleStoreJsonBuilder';

	constructor(name: T['name']) {
		super(name, 'json', 'SingleStoreJson');
	}

	/** @internal */
	override build(table: SingleStoreTable) {
		return new SingleStoreJson(
			table,
			this.config as any,
		);
	}
}

export class SingleStoreJson<T extends ColumnBaseConfig<'json'>> extends SingleStoreColumn<T> {
	static override readonly [entityKind]: string = 'SingleStoreJson';

	getSQLType(): string {
		return 'json';
	}

	override mapToDriverValue(value: T['data']): string {
		return JSON.stringify(value);
	}
}

export function json(): SingleStoreJsonBuilderInitial<''>;
export function json<TName extends string>(name: TName): SingleStoreJsonBuilderInitial<TName>;
export function json(name?: string) {
	return new SingleStoreJsonBuilder(name ?? '');
}
