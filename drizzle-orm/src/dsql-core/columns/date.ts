import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn } from './common.ts';
import { DSQLDateColumnBuilder } from './date.common.ts';

export class DSQLDateBuilder extends DSQLDateColumnBuilder<{
	dataType: 'object date';
	data: Date;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLDateBuilder';

	constructor(name: string) {
		super(name, 'object date', 'DSQLDate');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLDate {
		return new DSQLDate(table, this.config as any);
	}
}

export class DSQLDate extends DSQLColumn<'object date'> {
	static override readonly [entityKind]: string = 'DSQLDate';

	getSQLType(): string {
		return 'date';
	}

	override mapFromDriverValue(value: string): Date {
		return new Date(value + 'T00:00:00.000Z');
	}

	override mapToDriverValue(value: Date): string {
		return value.toISOString().split('T')[0]!;
	}
}

export function date(name?: string): DSQLDateBuilder {
	return new DSQLDateBuilder(name ?? '');
}
