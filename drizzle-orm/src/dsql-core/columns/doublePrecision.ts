import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLDoublePrecisionBuilder extends DSQLColumnBuilder<{
	dataType: 'number float64';
	data: number;
	driverParam: string | number;
}> {
	static override readonly [entityKind]: string = 'DSQLDoublePrecisionBuilder';

	constructor(name: string) {
		super(name, 'number float64', 'DSQLDoublePrecision');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLDoublePrecision {
		throw new Error('Method not implemented.');
	}
}

export class DSQLDoublePrecision extends DSQLColumn<'number float64'> {
	static override readonly [entityKind]: string = 'DSQLDoublePrecision';

	getSQLType(): string {
		return 'double precision';
	}

	override mapFromDriverValue(value: string | number): number {
		throw new Error('Method not implemented.');
	}
}

export function doublePrecision(name?: string): DSQLDoublePrecisionBuilder {
	return new DSQLDoublePrecisionBuilder(name ?? '');
}
