import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export interface DSQLVarcharConfig {
	length?: number;
}

export class DSQLVarcharBuilder extends DSQLColumnBuilder<
	{
		dataType: 'string';
		data: string;
		driverParam: string;
	},
	{ length: number | undefined }
> {
	static override readonly [entityKind]: string = 'DSQLVarcharBuilder';

	constructor(name: string, varcharConfig: DSQLVarcharConfig = {}) {
		super(name, 'string', 'DSQLVarchar');
		this.config.length = varcharConfig.length;
	}

	/** @internal */
	override build(table: DSQLTable): DSQLVarchar {
		return new DSQLVarchar(table, this.config as any);
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
