import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { PgTable } from '../table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgInetBuilder extends PgColumnBuilder<{
	name: string;
	dataType: 'string inet';
	data: string;
	driverParam: string;
	enumValues: undefined;
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

export class PgInet<T extends ColumnBaseConfig<'string inet'>> extends PgColumn<T> {
	static override readonly [entityKind]: string = 'PgInet';

	getSQLType(): string {
		return 'inet';
	}
}

export function inet(name?: string): PgInetBuilder {
	return new PgInetBuilder(name ?? '');
}
