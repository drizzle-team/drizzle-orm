import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export interface DSQLCharConfig {
	length?: number;
}

export class DSQLCharBuilder extends DSQLColumnBuilder<{
	dataType: 'string';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLCharBuilder';

	constructor(name: string, private config: DSQLCharConfig = {}) {
		super(name, 'string', 'DSQLChar');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLChar {
		throw new Error('Method not implemented.');
	}
}

export class DSQLChar extends DSQLColumn<'string'> {
	static override readonly [entityKind]: string = 'DSQLChar';

	readonly length: number | undefined;

	constructor(table: DSQLTable, config: any) {
		super(table, config);
		this.length = config.length;
	}

	getSQLType(): string {
		return this.length !== undefined ? `char(${this.length})` : 'char(1)';
	}
}

export function char(name?: string, config?: DSQLCharConfig): DSQLCharBuilder {
	return new DSQLCharBuilder(name ?? '', config);
}
