import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLByteaBuilder extends DSQLColumnBuilder<{
	dataType: 'buffer';
	data: Buffer;
	driverParam: Buffer;
}> {
	static override readonly [entityKind]: string = 'DSQLByteaBuilder';

	constructor(name: string) {
		super(name, 'buffer', 'DSQLBytea');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLBytea {
		throw new Error('Method not implemented.');
	}
}

export class DSQLBytea extends DSQLColumn<'buffer'> {
	static override readonly [entityKind]: string = 'DSQLBytea';

	getSQLType(): string {
		return 'bytea';
	}
}

export function bytea(name?: string): DSQLByteaBuilder {
	return new DSQLByteaBuilder(name ?? '');
}
