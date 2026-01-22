import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLBooleanBuilder extends DSQLColumnBuilder<{
	dataType: 'boolean';
	data: boolean;
	driverParam: boolean;
}> {
	static override readonly [entityKind]: string = 'DSQLBooleanBuilder';

	constructor(name: string) {
		super(name, 'boolean', 'DSQLBoolean');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLBoolean {
		throw new Error('Method not implemented.');
	}
}

export class DSQLBoolean extends DSQLColumn<'boolean'> {
	static override readonly [entityKind]: string = 'DSQLBoolean';

	getSQLType(): string {
		return 'boolean';
	}
}

export function boolean(name?: string): DSQLBooleanBuilder {
	return new DSQLBooleanBuilder(name ?? '');
}
