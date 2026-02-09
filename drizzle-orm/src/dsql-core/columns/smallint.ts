import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLSmallIntBuilder extends DSQLColumnBuilder<{
	dataType: 'number int16';
	data: number;
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'DSQLSmallIntBuilder';

	constructor(name: string) {
		super(name, 'number int16', 'DSQLSmallInt');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLSmallInt {
		return new DSQLSmallInt(table, this.config as any);
	}
}

export class DSQLSmallInt extends DSQLColumn<'number int16'> {
	static override readonly [entityKind]: string = 'DSQLSmallInt';

	getSQLType(): string {
		return 'smallint';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return Number(value);
		}
		return value;
	}
}

export function smallint(name?: string): DSQLSmallIntBuilder {
	return new DSQLSmallIntBuilder(name ?? '');
}
