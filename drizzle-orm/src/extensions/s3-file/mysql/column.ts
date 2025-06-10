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
import { MySqlColumn, MySqlColumnBuilder } from '~/mysql-core/index.ts';
import type { AnyMySqlTable, MySqlTable } from '~/mysql-core/table.ts';
import type { SQL } from '~/sql/index.ts';
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
import { DrizzleMySqlS3Extension } from './extension.ts';

export type MySqlS3FileBuilderInitial<TName extends string, TMode extends DrizzleS3FileMode> = MySqlS3FileBuilder<{
	name: TName;
	dataType: 'custom';
	columnType: 'MySqlS3File';
	data: DrizzleS3ObjectFile<DrizzleS3FileModeToData[TMode]>;
	enumValues: undefined;
	driverParam: string;
}>;

export class MySqlS3FileBuilder<
	T extends ColumnBuilderBaseConfig<'custom', 'MySqlS3File'>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends MySqlColumnBuilder<T, TRuntimeConfig, TTypeConfig> {
	static override readonly [entityKind]: string = 'MySqlS3FileBuilder';
	readonly [extensionColumnConfig]: MySqlS3FileExtensionColumnConfig;

	constructor(
		name: T['name'],
		config: MySqlS3FileConfig,
	) {
		super(name, 'custom', 'MySqlS3File');
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
		table: AnyMySqlTable<{ name: TTableName }>,
	): MySqlS3File<MakeColumnConfig<T, TTableName>> {
		return new MySqlS3File<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			this[extensionColumnConfig],
		);
	}
}

export type MySqlS3FileExtensionColumnConfig = {
	fetchMode: DrizzleS3FetchMode;
	fileMode: DrizzleS3FileMode;
	options?: RequestPresigningArguments;
};

export class MySqlS3File<
	T extends ColumnBaseConfig<'custom', 'MySqlS3File'> = ColumnBaseConfig<'custom', 'MySqlS3File'>,
> extends MySqlColumn<T, { enumValues: T['enumValues'] }> {
	static override readonly [entityKind]: string = 'MySqlS3File';
	override [requiredExtension] = DrizzleMySqlS3Extension;
	[extensionColumnConfig]: MySqlS3FileExtensionColumnConfig;

	constructor(
		table: MySqlTable,
		config: ColumnBuilderRuntimeConfig<T['data'], T>,
		extensionConfig?: MySqlS3FileExtensionColumnConfig,
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

	data(): MySqlColumn<Omit<T, 'data'> & { data: Assume<T['data'], DrizzleS3ObjectFile>['data'] }> {
		return new MySqlS3File(
			this.table,
			this.config as ColumnRuntimeConfig<
				DrizzleS3ObjectFile['data'],
				Omit<T, 'data'> & { data: Assume<T['data'], DrizzleS3ObjectFile>['data'] }
			>,
			{ fileMode: this[extensionColumnConfig].fileMode, fetchMode: 'data' },
		);
	}

	// meta(): Omit<MySqlS3File<Omit<T, 'data'> & { data: DrizzleS3ObjectMeta }>, 'data' | 'meta' | 'presigned'> {
	// 	return new MySqlS3File(
	// 		this.table,
	// 		this.config as ColumnRuntimeConfig<
	// 			DrizzleS3ObjectMeta,
	// 			Omit<T, 'data'> & { data: DrizzleS3ObjectMeta }
	// 		>,
	// 		{ fileMode: this[extensionColumnConfig].fileMode, fetchMode: 'meta' },
	// 	);
	// }

	presigned(options?: RequestPresigningArguments): MySqlColumn<Omit<T, 'data'> & { data: string }> {
		return new MySqlS3File(
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

export interface MySqlS3FileConfig<
	TMode extends DrizzleS3FileMode = DrizzleS3FileMode,
> {
	mode: TMode;
}

export function s3File<TName extends string, TMode extends DrizzleS3FileMode>(
	config: MySqlS3FileConfig<TMode>,
): MySqlS3FileBuilderInitial<TName, TMode>;
export function s3File<TName extends string, TMode extends DrizzleS3FileMode>(
	name: TName,
	config: MySqlS3FileConfig<TMode>,
): MySqlS3FileBuilderInitial<TName, TMode>;
export function s3File(a: string | MySqlS3FileConfig, b?: MySqlS3FileConfig): any {
	const { name, config } = getColumnNameAndConfig<MySqlS3FileConfig>(a, b);
	return new MySqlS3FileBuilder(name, config);
}
