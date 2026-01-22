import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLIntegerBuilder extends DSQLColumnBuilder<{
	dataType: 'number int32';
	data: number;
	driverParam: number | string;
}> {
	static override readonly [entityKind]: string = 'DSQLIntegerBuilder';

	constructor(name: string) {
		super(name, 'number int32', 'DSQLInteger');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLInteger {
		return new DSQLInteger(table, this.config as any);
	}
}

export class DSQLInteger extends DSQLColumn<'number int32'> {
	static override readonly [entityKind]: string = 'DSQLInteger';

	getSQLType(): string {
		return 'integer';
	}

	override mapFromDriverValue(value: number | string): number {
		if (typeof value === 'string') {
			return parseInt(value, 10);
		}
		return value;
	}
}

export function integer(name?: string): DSQLIntegerBuilder {
	return new DSQLIntegerBuilder(name ?? '');
}
