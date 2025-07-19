import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';

export type GelSmallIntBuilderInitial<TName extends string> = GelSmallIntBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GelSmallInt';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class GelSmallIntBuilder<T extends ColumnBuilderBaseConfig<'number'>>
	extends GelIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'GelSmallIntBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'GelSmallInt');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelSmallInt(table, this.config as any);
	}
}

export class GelSmallInt<T extends ColumnBaseConfig<'number'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelSmallInt';

	getSQLType(): string {
		return 'smallint';
	}
}

export function smallint(): GelSmallIntBuilderInitial<''>;
export function smallint<TName extends string>(name: TName): GelSmallIntBuilderInitial<TName>;
export function smallint(name?: string) {
	return new GelSmallIntBuilder(name ?? '');
}
