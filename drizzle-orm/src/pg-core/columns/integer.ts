import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn } from './common.ts';
import { PgIntColumnBaseBuilder } from './int.common.ts';

export class PgIntegerBuilder extends PgIntColumnBaseBuilder<{
	name: string;
	dataType: 'number integer';
	data: number;
	driverParam: number | string;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'PgIntegerBuilder';

	constructor(name: string) {
		super(name, 'number integer', 'PgInteger');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgInteger(table, this.config as any);
	}
}

export class PgInteger<T extends ColumnBaseConfig<'number integer'>> extends PgColumn<T> {
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
export function integer(name?: string): PgIntegerBuilder {
	return new PgIntegerBuilder(name ?? '');
}
