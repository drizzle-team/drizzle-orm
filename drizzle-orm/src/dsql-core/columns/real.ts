import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLRealBuilder extends DSQLColumnBuilder<{
	dataType: 'number float';
	data: number;
	driverParam: string | number;
}> {
	static override readonly [entityKind]: string = 'DSQLRealBuilder';

	constructor(name: string) {
		super(name, 'number float', 'DSQLReal');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLReal {
		throw new Error('Method not implemented.');
	}
}

export class DSQLReal extends DSQLColumn<'number float'> {
	static override readonly [entityKind]: string = 'DSQLReal';

	getSQLType(): string {
		return 'real';
	}

	override mapFromDriverValue(value: string | number): number {
		throw new Error('Method not implemented.');
	}
}

export function real(name?: string): DSQLRealBuilder {
	return new DSQLRealBuilder(name ?? '');
}
