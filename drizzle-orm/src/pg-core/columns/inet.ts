import type { ColumnBuilderBaseConfig } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export type PgInetBuilderInitial<TName extends string> = PgInetBuilder<{
	name: TName;
	dataType: 'string';
	columnType: 'PgInet';
	data: string;
	driverParam: string;
	enumValues: undefined;
}>;

export class PgInetBuilder<T extends ColumnBuilderBaseConfig<'string'>> extends PgColumnBuilder<T> {
	static override readonly [entityKind]: string = 'PgInetBuilder';

	constructor(name: T['name']) {
		super(name, 'string', 'PgInet');
	}

	/** @internal */
	override build(table: PgTable) {
		return new PgInet(table, this.config as any);
	}
}

export class PgInet<T extends ColumnBaseConfig<'string'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgInet';

	getSQLType(): string {
		return 'inet';
	}
}

export function inet(): PgInetBuilderInitial<''>;
export function inet<TName extends string>(name: TName): PgInetBuilderInitial<TName>;
export function inet(name?: string) {
	return new PgInetBuilder(name ?? '');
}
