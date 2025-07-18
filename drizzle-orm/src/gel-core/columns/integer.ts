import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '../table.ts';
import { GelColumn } from './common.ts';
import { GelIntColumnBaseBuilder } from './int.common.ts';

export type GelIntegerBuilderInitial<TName extends string> = GelIntegerBuilder<{
	name: TName;
	dataType: 'number';
	columnType: 'GelInteger';
	data: number;
	driverParam: number;
	enumValues: undefined;
}>;

export class GelIntegerBuilder<T extends ColumnBuilderBaseConfig<'number', 'GelInteger'>>
	extends GelIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'GelIntegerBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'GelInteger');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelInteger(table, this.config as any);
	}
}

export class GelInteger<T extends ColumnBaseConfig<'number', 'GelInteger'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelInteger';

	getSQLType(): string {
		return 'integer';
	}
}

export function integer(): GelIntegerBuilderInitial<''>;
export function integer<TName extends string>(name: TName): GelIntegerBuilderInitial<TName>;
export function integer(name?: string) {
	return new GelIntegerBuilder(name ?? '');
}
