import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export interface DSQLNumericConfig {
	precision?: number;
	scale?: number;
}

export class DSQLNumericBuilder extends DSQLColumnBuilder<{
	dataType: 'string';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLNumericBuilder';

	constructor(name: string, private config: DSQLNumericConfig = {}) {
		super(name, 'string', 'DSQLNumeric');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLNumeric {
		throw new Error('Method not implemented.');
	}
}

export class DSQLNumeric extends DSQLColumn<'string'> {
	static override readonly [entityKind]: string = 'DSQLNumeric';

	readonly precision: number | undefined;
	readonly scale: number | undefined;

	constructor(table: DSQLTable, config: any) {
		super(table, config);
		this.precision = config.precision;
		this.scale = config.scale;
	}

	getSQLType(): string {
		if (this.precision !== undefined && this.scale !== undefined) {
			return `numeric(${this.precision},${this.scale})`;
		}
		if (this.precision !== undefined) {
			return `numeric(${this.precision})`;
		}
		return 'numeric';
	}
}

export function numeric(name?: string, config?: DSQLNumericConfig): DSQLNumericBuilder {
	return new DSQLNumericBuilder(name ?? '', config);
}

export const decimal = numeric;
