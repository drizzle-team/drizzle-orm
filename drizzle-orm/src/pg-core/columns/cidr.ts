import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type {  PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgCidrBuilderInitial<TName extends string> = PgCidrBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgCidr';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgCidrBuilder<T extends ColumnBuilderBaseConfig<'string'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgCidrBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgCidr');
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgCidr(table, this.config as any);
	}
}

export class PgCidr<T extends ColumnBaseConfig<'string'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgCidr';

	getSQLType(): string {
		return 'cidr';
	}
}

export function cidr(): PgCidrBuilderInitial<''>;
export function cidr<TName extends string>(name: TName): PgCidrBuilderInitial<TName>;
export function cidr(name?: string) {
	return new PgCidrBuilder(name ?? '');
}
