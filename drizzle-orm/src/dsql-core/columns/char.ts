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

	constructor(name: string, private charConfig: DSQLCharConfig = {}) {
		super(name, 'string', 'DSQLChar');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLChar {
		return new DSQLChar(table, { ...this.config, length: this.charConfig.length } as any);
	}
}

export class DSQLChar extends DSQLColumn<'string'> {
	static override readonly [entityKind]: string = 'DSQLChar';

	override readonly length: number | undefined;

	constructor(table: DSQLTable, config: any) {
		super(table, config);
		this.length = config.length;
	}

	override getSQLType(): string {
		return this.length !== undefined ? `char(${this.length})` : 'char(1)';
	}
}

export function char(name?: string, config?: DSQLCharConfig): DSQLCharBuilder {
	return new DSQLCharBuilder(name ?? '', config);
}
