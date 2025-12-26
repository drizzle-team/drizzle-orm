import { entityKind } from '~/entity.ts';
import type { PgTable } from '~/pg-core/table.ts';
import { PgColumn, PgColumnBuilder } from './common.ts';

export class PgRealBuilder extends PgColumnBuilder<
	{
		dataType: 'number float';
		data: number;
		driverParam: string | number;
	},
	{ length: number | undefined }
> {
	static override readonly [entityKind]: string = 'PgRealBuilder';

	constructor(name: string, length?: number) {
		super(name, 'number float', 'PgReal');
		this.config.length = length;
	}

	/** @internal */
	override build(table: PgTable<any>) {
		return new PgReal(table, this.config as any);
	}
}

export class PgReal extends PgColumn<'number float'> {
	static override readonly [entityKind]: string = 'PgReal';

	constructor(table: PgTable<any>, config: PgRealBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'real';
	}

	override mapFromDriverValue(value: string | number): number {
		if (typeof value === 'string') {
			return Number.parseFloat(value);
		}
		return value;
	}
}

export function real(name?: string): PgRealBuilder {
	return new PgRealBuilder(name ?? '');
}
