import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export interface DSQLVarcharConfig {
	length?: number;
}

export class DSQLVarcharBuilder extends DSQLColumnBuilder<{
	dataType: 'string';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLVarcharBuilder';

	constructor(name: string, private config: DSQLVarcharConfig = {}) {
		super(name, 'string', 'DSQLVarchar');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLVarchar {
		throw new Error('Method not implemented.');
	}
}

export class DSQLVarchar extends DSQLColumn<'string'> {
	static override readonly [entityKind]: string = 'DSQLVarchar';

	readonly length: number | undefined;

	constructor(table: DSQLTable, config: any) {
		super(table, config);
		this.length = config.length;
	}

	getSQLType(): string {
		return this.length !== undefined ? `varchar(${this.length})` : 'varchar';
	}
}

export function varchar(name?: string, config?: DSQLVarcharConfig): DSQLVarcharBuilder {
	return new DSQLVarcharBuilder(name ?? '', config);
}
