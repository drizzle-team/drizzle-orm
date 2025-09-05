import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyCockroachTable } from '../table.ts';
import { CockroachColumn, CockroachColumnWithArrayBuilder } from './common.ts';

export class CockroachInetBuilder extends CockroachColumnWithArrayBuilder<{
	dataType: 'string inet';
	data: string;
	driverParam: string;
}> {
	static override readonly [entityKind]: string = 'CockroachInetBuilder';

	constructor(name: string) {
		super(name, 'string inet', 'CockroachInet');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyCockroachTable<{ name: TTableName }>,
	) {
		return new CockroachInet(
			table,
			this.config,
		);
	}
}

export class CockroachInet<T extends ColumnBaseConfig<'string inet'>> extends CockroachColumn<T> {
	static override readonly [entityKind]: string = 'CockroachInet';

	getSQLType(): string {
		return 'inet';
	}
}

export function inet(name?: string) {
	return new CockroachInetBuilder(name ?? '');
}
