import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgMacaddr8BuilderInitial<TName extends string> = PgMacaddr8Builder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgMacaddr8';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgMacaddr8Builder<T extends ColumnBuilderBaseConfig<'string'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgMacaddr8Builder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgMacaddr8');
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgMacaddr8(table, this.config as any);
	}
}

export class PgMacaddr8<T extends ColumnBaseConfig<'string'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgMacaddr8';

	getSQLType(): string {
		return 'macaddr8';
	}
}

export function macaddr8(): PgMacaddr8BuilderInitial<''>;
export function macaddr8<TName extends string>(name: TName): PgMacaddr8BuilderInitial<TName>;
export function macaddr8(name?: string) {
	return new PgMacaddr8Builder(name ?? '');
}
