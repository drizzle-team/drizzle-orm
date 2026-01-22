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
		throw new Error('Method not implemented.');
	}
}

export class DSQLInteger extends DSQLColumn<'number int32'> {
	static override readonly [entityKind]: string = 'DSQLInteger';

	getSQLType(): string {
		return 'integer';
	}

	override mapFromDriverValue(value: number | string): number {
		throw new Error('Method not implemented.');
	}
}

export function integer(name?: string): DSQLIntegerBuilder {
	return new DSQLIntegerBuilder(name ?? '');
}
