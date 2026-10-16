import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLIntervalBuilder extends DSQLColumnBuilder<{
	dataType: 'string';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLIntervalBuilder';

	constructor(name: string) {
		super(name, 'string', 'DSQLInterval');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLInterval {
		return new DSQLInterval(table, this.config as any);
	}
}

export class DSQLInterval extends DSQLColumn<'string'> {
	static override readonly [entityKind]: string = 'DSQLInterval';

	getSQLType(): string {
		return 'interval';
	}
}

export function interval(name?: string): DSQLIntervalBuilder {
	return new DSQLIntervalBuilder(name ?? '');
}
