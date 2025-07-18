import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable, GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelRealBuilderInitial<TName extends string> = GelRealBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GelReal';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class GelRealBuilder<T extends ColumnBuilderBaseConfig<'number', 'GelReal'>> extends GelColumnBuilder<
	T,
	{ length: number | undefined }
> {
	static override readonly [entityKind]: string = 'GelRealBuilder';

	constructor(name: T['name'], length?: number) {
		super(name, 'number', 'GelReal');
		this.config.length = length;
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelReal(table, this.config as any);
	}
}

export class GelReal<T extends ColumnBaseConfig<'number', 'GelReal'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelReal';

	constructor(table: AnyGelTable<{ name: T['tableName'] }>, config: GelRealBuilder<T>['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'real';
	}
}

export function real(): GelRealBuilderInitial<''>;
export function real<TName extends string>(name: TName): GelRealBuilderInitial<TName>;
export function real(name?: string) {
	return new GelRealBuilder(name ?? '');
}
