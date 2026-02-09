import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLByteaBuilder extends DSQLColumnBuilder<{
	dataType: 'object buffer';
	data: Buffer;
	driverParam: Buffer;
}> {
	static override readonly [entityKind]: string = 'DSQLByteaBuilder';

	constructor(name: string) {
		super(name, 'object buffer', 'DSQLBytea');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLBytea {
		return new DSQLBytea(table, this.config as any);
	}
}

export class DSQLBytea extends DSQLColumn<'object buffer'> {
	static override readonly [entityKind]: string = 'DSQLBytea';

	getSQLType(): string {
		return 'bytea';
	}
}

export function bytea(name?: string): DSQLByteaBuilder {
	return new DSQLByteaBuilder(name ?? '');
}
