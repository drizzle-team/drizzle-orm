import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLTextBuilder extends DSQLColumnBuilder<{
	dataType: 'string';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLTextBuilder';

	constructor(name: string) {
		super(name, 'string', 'DSQLText');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLText {
		return new DSQLText(table, this.config as any);
	}
}

export class DSQLText extends DSQLColumn<'string'> {
	static override readonly [entityKind]: string = 'DSQLText';

	getSQLType(): string {
		return 'text';
	}
}

export function text(name?: string): DSQLTextBuilder {
	return new DSQLTextBuilder(name ?? '');
}
