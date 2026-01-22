import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLDateBuilder extends DSQLColumnBuilder<{
	dataType: 'date';
	data: Date;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLDateBuilder';

	constructor(name: string) {
		super(name, 'date', 'DSQLDate');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLDate {
		throw new Error('Method not implemented.');
	}
}

export class DSQLDate extends DSQLColumn<'date'> {
	static override readonly [entityKind]: string = 'DSQLDate';

	getSQLType(): string {
		return 'date';
	}

	override mapFromDriverValue(value: string): Date {
		throw new Error('Method not implemented.');
	}

	override mapToDriverValue(value: Date): string {
		throw new Error('Method not implemented.');
	}
}

export function date(name?: string): DSQLDateBuilder {
	return new DSQLDateBuilder(name ?? '');
}
