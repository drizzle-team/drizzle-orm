import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn } from './common.ts';
import { PgIntColumnBaseBuilder } from './int.common.ts';

export type PgIntegerBuilderInitial<TName extends string> = PgIntegerBuilder<{
	name: TName;
	dataType: 'number';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}>;

export class PgIntegerBuilder<T extends ColumnBuilderBaseConfig<'number'>>
	extends PgIntColumnBaseBuilder<T>
{
	static override readonly [entityKind]: string = 'PgIntegerBuilder';

	constructor(name: T['name']) {
		super(name, 'number', 'PgInteger');
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgInteger(table, this.config as any);
	}
}

export class PgInteger<T extends ColumnBaseConfig<'number'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgInteger';

	getSQLType(): string {
		return 'integer';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number.parseInt(value);
		}
		return value;
	}
}

export function integer(): PgIntegerBuilderInitial<''>;
export function integer<TName extends string>(name: TName): PgIntegerBuilderInitial<TName>;
export function integer(name?: string) {
	return new PgIntegerBuilder(name ?? '');
}
