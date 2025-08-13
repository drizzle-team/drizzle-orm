import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { GelTable } from '~/gel-core/table.ts';
import { GelColumn, GelColumnBuilder } from './common.ts';

export class GelTextBuilder extends GelColumnBuilder<{
	name: string;
	dataType: 'string text';
	data: string;
	driverParam: string;
	enumValues: undefined;
}> {
	static override readonly [entityKind]: string = 'GelTextBuilder';

	constructor(
		name: string,
	) {
		super(name, 'string text', 'GelText');
	}

	/** @internal */
	override build(table: GelTable) {
		return new GelText(table, this.config as any);
	}
}

export class GelText<T extends ColumnBaseConfig<'string text'>> extends GelColumn<T, { enumValues: T['enumValues'] }> {
	static override readonly [entityKind]: string = 'GelText';

	override readonly enumValues = this.config.enumValues;

	getSQLType(): string {
		return 'text';
	}
}

export function text(name?: string): GelTextBuilder {
	return new GelTextBuilder(name ?? '');
}
