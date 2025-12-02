import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyGelTable, GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export class GelRealBuilder extends GelColumnBuilder<
	{
		dataType: 'number float';
		data: number;
		driverParam: number;
	},
	{ length: number | undefined }
> {
	static override readonly [entityKind]: string = 'GelRealBuilder';

	constructor(name: string, length?: number) {
		super(name, 'number float', 'GelReal');
		this.config.length = length;
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelReal(table, this.config as any);
	}
}

export class GelReal<T extends ColumnBaseConfig<'number float' | 'number ufloat'>> extends GelColumn<T> {
	static override readonly [entityKind]: string = 'GelReal';

	constructor(table: AnyGelTable<{ name: T['tableName'] }>, config: GelRealBuilder['config']) {
		super(table, config);
	}

	getSQLType(): string {
		return 'real';
	}
}

export function real(name?: string): GelRealBuilder {
	return new GelRealBuilder(name ?? '');
}
