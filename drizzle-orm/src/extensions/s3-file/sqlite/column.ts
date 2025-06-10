import type {
	ColumnBuilderBaseConfig,
	ColumnBuilderRuntimeConfig,
	HasDefault,
	HasGenerated,
	MakeColumnConfig,
} from '~/column-builder.ts';
import type { ColumnBaseConfig, ColumnRuntimeConfig } from '~/column.ts';
import { entityKind } from '~/entity.ts';
import { extensionColumnConfig, requiredExtension } from '~/extension-core/index.ts';
import type { SQL } from '~/sql/index.ts';
import { SQLiteColumn, SQLiteColumnBuilder } from '~/sqlite-core/index.ts';
import type { AnySQLiteTable, SQLiteTable } from '~/sqlite-core/table.ts';
import { type Assume, getColumnNameAndConfig } from '~/utils.ts';
import {
	type DrizzleS3FetchMode,
	type DrizzleS3FileMode,
	type DrizzleS3FileModeToData,
	type DrizzleS3ObjectFile,
	type DrizzleS3ObjectIdentification,
	objectIdToText,
	type RequestPresigningArguments,
} from '../common.ts';
import { DrizzleSQLiteS3Extension } from './extension.ts';

export type SQLiteS3FileBuilderInitial<TName extends string, TMode extends DrizzleS3FileMode> = SQLiteS3FileBuilder<{
	name: TName;
	dataType: 'custom';
	columnType: 'SQLiteS3File';
	data: DrizzleS3ObjectFile<DrizzleS3FileModeToData[TMode]>;
	enumValues: undefined;
	driverParam: string;
}>;

export class SQLiteS3FileBuilder<
	T extends ColumnBuilderBaseConfig<'custom', 'SQLiteS3File'>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends SQLiteColumnBuilder<T, TRuntimeConfig, TTypeConfig> {
	static override readonly [entityKind]: string = 'SQLiteS3FileBuilder';
	readonly [extensionColumnConfig]: SQLiteS3FileExtensionColumnConfig;

	constructor(
		name: T['name'],
		config: SQLiteS3FileConfig,
	) {
		super(name, 'custom', 'SQLiteS3File');
		this[extensionColumnConfig] = {
			fileMode: config.mode,
			fetchMode: 'file',
		};
	}

	/**
	 * Allows to set default to an existing file
	 *
	 * @example
	 * ```
	 * fileColumn: s3File().default(sql`${bucket}:${key}`)
	 * ```
	 *
	 * @returns
	 */
	override default(value: SQL<unknown>): HasDefault<this> {
		return super.default(value);
	}

	override generatedAlwaysAs(as: SQL<unknown> | (() => SQL)): HasGenerated<this, { type: 'always' }> {
		return super.generatedAlwaysAs(as);
	}

	/** @internal */
	override build<TTableName extends string>(
		table: AnySQLiteTable<{ name: TTableName }>,
	): SQLiteS3File<MakeColumnConfig<T, TTableName>> {
		return new SQLiteS3File<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			this[extensionColumnConfig],
		);
	}
}

export type SQLiteS3FileExtensionColumnConfig = {
	fetchMode: DrizzleS3FetchMode;
	fileMode: DrizzleS3FileMode;
	options?: RequestPresigningArguments;
};

export class SQLiteS3File<
	T extends ColumnBaseConfig<'custom', 'SQLiteS3File'> = ColumnBaseConfig<'custom', 'SQLiteS3File'>,
> extends SQLiteColumn<T, { enumValues: T['enumValues'] }> {
	static override readonly [entityKind]: string = 'SQLiteS3File';
	override [requiredExtension] = DrizzleSQLiteS3Extension;
	[extensionColumnConfig]: SQLiteS3FileExtensionColumnConfig;

	constructor(
		table: SQLiteTable,
		config: ColumnBuilderRuntimeConfig<T['data'], T>,
		extensionConfig?: SQLiteS3FileExtensionColumnConfig,
	) {
		super(table, config);

		this[extensionColumnConfig] = extensionConfig ?? {
			fileMode: 'buffer',
			fetchMode: 'file',
		};
	}

	override mapToDriverValue(value: unknown): string {
		if (typeof value === 'string') return value;

		return objectIdToText(value as DrizzleS3ObjectIdentification);
	}

	data(): SQLiteColumn<Omit<T, 'data'> & { data: Assume<T['data'], DrizzleS3ObjectFile>['data'] }> {
		return new SQLiteS3File(
			this.table,
			this.config as ColumnRuntimeConfig<
				DrizzleS3ObjectFile['data'],
				Omit<T, 'data'> & { data: Assume<T['data'], DrizzleS3ObjectFile>['data'] }
			>,
			{ fileMode: this[extensionColumnConfig].fileMode, fetchMode: 'data' },
		);
	}

	// meta(): Omit<SQLiteS3File<Omit<T, 'data'> & { data: DrizzleS3ObjectMeta }>, 'data' | 'meta' | 'presigned'> {
	// 	return new SQLiteS3File(
	// 		this.table,
	// 		this.config as ColumnRuntimeConfig<
	// 			DrizzleS3ObjectMeta,
	// 			Omit<T, 'data'> & { data: DrizzleS3ObjectMeta }
	// 		>,
	// 		{ fileMode: this[extensionColumnConfig].fileMode, fetchMode: 'meta' },
	// 	);
	// }

	presigned(options?: RequestPresigningArguments): SQLiteColumn<Omit<T, 'data'> & { data: string }> {
		return new SQLiteS3File(
			this.table,
			this.config as ColumnRuntimeConfig<
				string,
				Omit<T, 'data'> & { data: string }
			>,
			{ fileMode: this[extensionColumnConfig].fileMode, fetchMode: 'presigned', options },
		);
	}

	getSQLType(): string {
		return 'text';
	}
}

export interface SQLiteS3FileConfig<
	TMode extends DrizzleS3FileMode = DrizzleS3FileMode,
> {
	mode: TMode;
}

export function s3File<TName extends string, TMode extends DrizzleS3FileMode>(
	config: SQLiteS3FileConfig<TMode>,
): SQLiteS3FileBuilderInitial<TName, TMode>;
export function s3File<TName extends string, TMode extends DrizzleS3FileMode>(
	name: TName,
	config: SQLiteS3FileConfig<TMode>,
): SQLiteS3FileBuilderInitial<TName, TMode>;
export function s3File(a: string | SQLiteS3FileConfig, b?: SQLiteS3FileConfig): any {
	const { name, config } = getColumnNameAndConfig<SQLiteS3FileConfig>(a, b);
	return new SQLiteS3FileBuilder(name, config);
}
