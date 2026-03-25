import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgJsonbBuilder extends PgColumnBuilder<{
	dataType: 'object json';
	data: unknown;
	driverParam: unknown;
}> {
	static override readonly [entityKind]: string = 'PgJsonbBuilder';

	constructor(name: string) {
		super(name, 'object json', 'PgJsonb');
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgJsonb(table, this.config as any);
	}
}

export class PgJsonb extends PgColumn<'object json'> {
	static override readonly [entityKind]: string = 'PgJsonb';

	constructor(table: PgTable<any>, config: PgJsonbBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'jsonb';
	}
}

export function jsonb(name?: string): PgJsonbBuilder {
	return new PgJsonbBuilder(name ?? '');
}
