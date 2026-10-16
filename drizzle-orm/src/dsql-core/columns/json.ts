import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLJsonBuilder extends DSQLColumnBuilder<{
	dataType: 'object json';
	data: unknown;
	driverParam: unknown;
}> {
	static override readonly [entityKind]: string = 'DSQLJsonBuilder';

	constructor(name: string) {
		super(name, 'object json', 'DSQLJson');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLJson {
		return new DSQLJson(table, this.config as any);
	}
}

export class DSQLJson extends DSQLColumn<'object json'> {
	static override readonly [entityKind]: string = 'DSQLJson';

	getSQLType(): string {
		return 'json';
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

export function json(name?: string): DSQLJsonBuilder {
	return new DSQLJsonBuilder(name ?? '');
}
