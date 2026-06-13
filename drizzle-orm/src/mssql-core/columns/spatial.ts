import type { ColumnBaseConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import type { AnyMsSqlTable } from '~/mssql-core/table.ts';
import { MsSqlColumn, MsSqlColumnBuilder } from './common.ts';

export class MsSqlGeographyBuilder extends MsSqlColumnBuilder<{
	dataType: 'object geometry';
	data: unknown;
	driverParam: unknown;
}> {
	static override readonly [entityKind]: string = 'MsSqlGeographyBuilder';

	constructor(name: string) {
		super(name, 'object geometry', 'MsSqlGeography');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlGeography(table, this.config);
	}
}

export class MsSqlGeography<T extends ColumnBaseConfig<'object geometry'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlGeography';

	getSQLType(): string {
		return 'geography';
	}
}

export class MsSqlGeometryBuilder extends MsSqlColumnBuilder<{
	dataType: 'object geometry';
	data: unknown;
	driverParam: unknown;
}> {
	static override readonly [entityKind]: string = 'MsSqlGeometryBuilder';

	constructor(name: string) {
		super(name, 'object geometry', 'MsSqlGeometry');
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnyMsSqlTable<{ name: TTableName }>,
	) {
		return new MsSqlGeometry(table, this.config);
	}
}

export class MsSqlGeometry<T extends ColumnBaseConfig<'object geometry'>> extends MsSqlColumn<T> {
	static override readonly [entityKind]: string = 'MsSqlGeometry';

	getSQLType(): string {
		return 'geometry';
	}
}

export function geography(name?: string) {
	return new MsSqlGeographyBuilder(name ?? '');
}

export function geometry(name?: string) {
	return new MsSqlGeometryBuilder(name ?? '');
}
