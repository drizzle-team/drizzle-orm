import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLJsonbBuilder extends DSQLColumnBuilder<{
	dataType: 'object json';
	data: unknown;
	driverParam: unknown;
}> {
	static override readonly [entityKind]: string = 'DSQLJsonbBuilder';

	constructor(name: string) {
		super(name, 'object json', 'DSQLJsonb');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLJsonb {
		return new DSQLJsonb(table, this.config as any);
	}
}

export class DSQLJsonb extends DSQLColumn<'object json'> {
	static override readonly [entityKind]: string = 'DSQLJsonb';

	getSQLType(): string {
		return 'jsonb';
	}

	override mapToDriverValue = (value: unknown): string => {
		return JSON.stringify(value);
	};

	override mapFromDriverValue = (value: unknown): unknown => {
		if (typeof value === 'string') {
			try {
				return JSON.parse(value);
			} catch {
				return value;
			}
		}
		return value;
	};
}

export function jsonb(name?: string): DSQLJsonbBuilder {
	return new DSQLJsonbBuilder(name ?? '');
}
