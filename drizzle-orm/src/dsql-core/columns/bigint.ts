import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLBigIntBuilder extends DSQLColumnBuilder<{
	dataType: 'bigint';
	data: bigint;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLBigIntBuilder';

	constructor(name: string) {
		super(name, 'bigint', 'DSQLBigInt');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLBigInt {
		throw new Error('Method not implemented.');
	}
}

export class DSQLBigInt extends DSQLColumn<'bigint'> {
	static override readonly [entityKind]: string = 'DSQLBigInt';

	getSQLType(): string {
		return 'bigint';
	}

	override mapFromDriverValue(value: string): bigint {
		throw new Error('Method not implemented.');
	}
}

export function bigint(name?: string): DSQLBigIntBuilder {
	return new DSQLBigIntBuilder(name ?? '');
}
