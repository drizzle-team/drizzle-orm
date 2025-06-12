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
import { SingleStoreColumn, SingleStoreColumnBuilder } from '~/singlestore-core/index.ts';
import type { AnySingleStoreTable, SingleStoreTable } from '~/singlestore-core/table.ts';
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
import { DrizzleSingleStoreS3Extension } from './extension.ts';

export type SingleStoreS3FileBuilderInitial<TName extends string, TMode extends DrizzleS3FileMode> =
	SingleStoreS3FileBuilder<{
		name: TName;
		dataType: 'custom';
		columnType: 'SingleStoreS3File';
		data: DrizzleS3ObjectFile<DrizzleS3FileModeToData[TMode]>;
		enumValues: undefined;
		driverParam: string;
	}>;

export class SingleStoreS3FileBuilder<
	T extends ColumnBuilderBaseConfig<'custom', 'SingleStoreS3File'>,
	TRuntimeConfig extends object = {},
	TTypeConfig extends object = {},
> extends SingleStoreColumnBuilder<T, TRuntimeConfig, TTypeConfig> {
	static override readonly [entityKind]: string = 'SingleStoreS3FileBuilder';
	readonly [extensionColumnConfig]: SingleStoreS3FileExtensionColumnConfig;

	constructor(
		name: T['name'],
		config: SingleStoreS3FileConfig,
	) {
		super(name, 'custom', 'SingleStoreS3File');
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
		table: AnySingleStoreTable<{ name: TTableName }>,
	): SingleStoreS3File<MakeColumnConfig<T, TTableName>> {
		return new SingleStoreS3File<MakeColumnConfig<T, TTableName>>(
			table,
			this.config as ColumnBuilderRuntimeConfig<any, any>,
			this[extensionColumnConfig],
		);
	}
}

export type SingleStoreS3FileExtensionColumnConfig = {
	fetchMode: DrizzleS3FetchMode;
	fileMode: DrizzleS3FileMode;
	options?: RequestPresigningArguments;
};

export class SingleStoreS3File<
	T extends ColumnBaseConfig<'custom', 'SingleStoreS3File'> = ColumnBaseConfig<'custom', 'SingleStoreS3File'>,
> extends SingleStoreColumn<T, { enumValues: T['enumValues'] }> {
	static override readonly [entityKind]: string = 'SingleStoreS3File';
	override [requiredExtension] = DrizzleSingleStoreS3Extension;
	[extensionColumnConfig]: SingleStoreS3FileExtensionColumnConfig;

	constructor(
		table: SingleStoreTable,
		config: ColumnBuilderRuntimeConfig<T['data'], T>,
		extensionConfig?: SingleStoreS3FileExtensionColumnConfig,
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

	data(): SingleStoreColumn<Omit<T, 'data'> & { data: Assume<T['data'], DrizzleS3ObjectFile>['data'] }> {
		return new SingleStoreS3File(
			this.table,
			this.config as ColumnRuntimeConfig<
				DrizzleS3ObjectFile['data'],
				Omit<T, 'data'> & { data: Assume<T['data'], DrizzleS3ObjectFile>['data'] }
			>,
			{ fileMode: this[extensionColumnConfig].fileMode, fetchMode: 'data' },
		);
	}

	presigned(options?: RequestPresigningArguments): SingleStoreColumn<Omit<T, 'data'> & { data: string }> {
		return new SingleStoreS3File(
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

export interface SingleStoreS3FileConfig<
	TMode extends DrizzleS3FileMode = DrizzleS3FileMode,
> {
	mode: TMode;
}

export function s3File<TName extends string, TMode extends DrizzleS3FileMode>(
	config: SingleStoreS3FileConfig<TMode>,
): SingleStoreS3FileBuilderInitial<TName, TMode>;
export function s3File<TName extends string, TMode extends DrizzleS3FileMode>(
	name: TName,
	config: SingleStoreS3FileConfig<TMode>,
): SingleStoreS3FileBuilderInitial<TName, TMode>;
export function s3File(a: string | SingleStoreS3FileConfig, b?: SingleStoreS3FileConfig): any {
	const { name, config } = getColumnNameAndConfig<SingleStoreS3FileConfig>(a, b);
	return new SingleStoreS3FileBuilder(name, config);
}
