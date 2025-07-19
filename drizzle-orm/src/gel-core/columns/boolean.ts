import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export type GelBooleanBuilderInitial<TName extends string> = GelBooleanBuilder<{
	name: TName;
	dataType: 'boolean';
	data: boolean;
	driverParam: boolean;
	enumValues: undefined;
}>;

export class GelBooleanBuilder<T extends ColumnBuilderBaseConfig<'boolean'>> extends GelColumnBuilder<T> {
	static override readonly [entityKind]: string = 'GelBooleanBuilder';

	constructor(name: T['name']) {
		super(name, 'boolean', 'GelBoolean');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelBoolean(table, this.config as any);
	}
}

export class GelBoolean<T extends ColumnBaseConfig<'boolean'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelBoolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(): GelBooleanBuilderInitial<''>;
export function boolean<TName extends string>(name: TName): GelBooleanBuilderInitial<TName>;
export function boolean(name?: string) {
	return new GelBooleanBuilder(name ?? '');
}
