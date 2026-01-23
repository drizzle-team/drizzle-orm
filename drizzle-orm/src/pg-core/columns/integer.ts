import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn } from './common.ts';
import { PgIntColumnBuilder } from './int.common.ts';

export class PgIntegerBuilder extends PgIntColumnBuilder<{
	dataType: 'number int32';
	data: number;
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'PgIntegerBuilder';

	constructor(name: string) {
		super(name, 'number int32', 'PgInteger');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgInteger(table, this.config as any);
	}
}

export class PgInteger extends PgColumn<'number int32'> {
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
