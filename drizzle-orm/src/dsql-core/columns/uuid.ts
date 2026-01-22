import { entityKind } from '~/entity.ts';
import type { DSQLTable } from '../table.ts';
import { DSQLColumn, DSQLColumnBuilder } from './common.ts';

export class DSQLUUIDBuilder extends DSQLColumnBuilder<{
	dataType: 'string uuid';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'DSQLUUIDBuilder';

	constructor(name: string) {
		super(name, 'string uuid', 'DSQLUUID');
	}

	/** @internal */
	override build(table: DSQLTable): DSQLUUID {
		throw new Error('Method not implemented.');
	}
}

export class DSQLUUID extends DSQLColumn<'string uuid'> {
	static override readonly [entityKind]: string = 'DSQLUUID';

	getSQLType(): string {
		return 'uuid';
	}
}

export function uuid(name?: string): DSQLUUIDBuilder {
	return new DSQLUUIDBuilder(name ?? '');
}
