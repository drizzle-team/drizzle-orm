import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgInetBuilder extends PgColumnBuilder<{
	dataType: 'string inet';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'PgInetBuilder';

	constructor(name: string) {
		super(name, 'string inet', 'PgInet');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgInet(table, this.config as any);
	}
}

export class PgInet extends PgColumn<'string inet'> {
	static override readonly [entityKind]: string = 'PgInet';

	getSQLType(): string {
		return 'inet';
	}
}

export function inet(name?: string): PgInetBuilder {
	return new PgInetBuilder(name ?? '');
}
