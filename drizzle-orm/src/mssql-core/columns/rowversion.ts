import type { HasDefault, NotNull } from '~/column-builder.ts';
import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export class MsSqlRowVersionBuilder extends MsSqlColumnBuilder<{
	dataType: 'object buffer';
	data: Buffer;
	driverParam: Buffer;
}> {
	static override readonly [entityKind]: string = 'MsSqlRowVersionBuilder';

	constructor(name: string) {
		super(name, 'object buffer', 'MsSqlRowVersion');
		this.config.hasDefault = true;
		this.config.notNull = true;
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlRowVersion(table, this.config);
	}
}

export class MsSqlRowVersion<T extends ColumnBaseConfig<'object buffer'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlRowVersion';

	override shouldDisableInsert(): boolean {
		return true;
	}

	getSQLType(): string {
		return 'rowversion';
	}
}

export function rowversion(name?: string): NotNull<HasDefault<MsSqlRowVersionBuilder>> {
	return new MsSqlRowVersionBuilder(name ?? '') as NotNull<HasDefault<MsSqlRowVersionBuilder>>;
}
