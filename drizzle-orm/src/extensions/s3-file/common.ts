import { GetObjectCommand, /*HeadObjectCommand,*/ PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import type { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { DrizzleError } from '~/errors.ts';
import type { ExtensionParam } from '~/sql/sql.ts';
import type { Simplify } from '~/utils.ts';

// Local class, won't be used with `is` nor `instanceof`
// eslint-disable-next-line drizzle-internal/require-entity-kind
class PresignerImporter {
	private static presignerImportSource: string = ['@aws', 'sdk/s3', 'request', 'presigner'].join('-');
	private static presigner: typeof getSignedUrl | undefined = undefined;
	constructor() {}

	static async importPresigner(): Promise<typeof getSignedUrl> {
		if (this.presigner) return this.presigner;

		this.presigner = await import(this.presignerImportSource).then((e) => e.getSignedUrl);

		return this.presigner!;
	}
}

const AsyncFunction = (async function() {}.constructor) as {
	new(...args: string[]): (...args: any[]) => Promise<any>;
	(...args: string[]): (...args: any[]) => Promise<any>;
};

export interface DecoderFunction {
	(
		s3: S3Client,
		data: Record<string, unknown>[] | Record<string, unknown>,
		errors: unknown[],
		downloader: typeof downloadFile,
		// metagetter: typeof downloadFileMeta,
		presigner: typeof presignDownload,
		idGetter: typeof textToObjectId,
	): Promise<void>;
}

export interface EncoderFunction {
	(
		s3: S3Client,
		placeholders: Record<string, unknown> | undefined,
		errors: unknown[],
		uploader: typeof uploadFile,
		idBuilder: typeof objectIdToText,
	): Promise<void>;
}

const buildFunctionArrayRecursion = (dimensions: number, body: string): string => {
	if (dimensions) {
		return buildFunctionArrayRecursion(dimensions - 1, `arr?.forEach((arr, i${dimensions}) => ${body})`);
	}

	return body;
};

const buildArrayRecursionIndexAccess = (dimensions: number) => {
	let idxs = '';
	for (let idx = 1; idx <= dimensions; ++idx) {
		idxs = `${idxs}[i${idx}]`;
	}
	return idxs;
};

const formPresignerOptions = (options?: RequestPresigningArguments) => {
	if (!options) return 'undefined';

	const fields = Object.entries(options).map(([k, v]) =>
		// eslint-disable-next-line no-instanceof/no-instanceof
		`${JSON.stringify(k)}: ${v instanceof Set ? `new Set(${JSON.stringify([...v])})` : JSON.stringify(v)}`
	).join(',\n');

	return `{${fields}}`;
};

export const buildDecoderInner = (mappingInstructions: DrizzleS3FileOutputMappingInstruction[]): string => {
	return mappingInstructions.map((i) => {
		const path = i.path.join('');
		const optPath = i.path.join('?.');

		return `if(row${optPath}) {\n` + (
			'subinstructions' in i
				? `row${path}.forEach(row => {
			${buildDecoderInner(i.subinstructions)} 
			});`
				: i.arrayDimensions
				? `const arr = row${path};
				` + buildFunctionArrayRecursion(
					i.arrayDimensions,
					`p.push((async () => {
								if(!arr || typeof arr !== 'string') return;

								const { key, bucket } = idGetter(arr);
								row${path}${buildArrayRecursionIndexAccess(i.arrayDimensions)} = await ${
						i.fetchMode === 'file' || i.fetchMode === 'data'
							? 'downloader'
							: i.fetchMode === 'presigned'
							? 'presigner'
							: 'metagetter'
					}({ key, bucket, s3, mode: ${JSON.stringify(i.fileMode)}, fileOnly: ${
						i.fetchMode === 'data' ? 'true' : 'false'
					}, options: ${formPresignerOptions(i.options)}});
						})().catch((e) => errors.push(e)))`,
				)
				: `p.push((async () => {
						const str = row${path};
						if(typeof str !== 'string') return;

						const { key, bucket } = idGetter(str);
						row${path} = await ${
					i.fetchMode === 'file' || i.fetchMode === 'data'
						? 'downloader'
						: i.fetchMode === 'presigned'
						? 'presigner'
						: 'metagetter'
				}({ key, bucket, s3, mode: ${JSON.stringify(i.fileMode)}, fileOnly: ${
					i.fetchMode === 'data' ? 'true' : 'false'
				}, options: ${formPresignerOptions(i.options)}});
						})().catch((e) => errors.push(e)));`
		) + `
		}`;
	}).join('\n');
};

export const buildDecoder = (
	mappingInstructions: DrizzleS3FileOutputMappingInstruction[],
	mode: 'first' | 'many' = 'many',
): DecoderFunction => {
	if (!mappingInstructions.length) return () => undefined as any;

	return new AsyncFunction(
		's3',
		'data',
		'errors',
		'downloader',
		// 'metagetter',
		'presigner',
		'idGetter',
		mode === 'many'
			? `
			await Promise.all(data.reduce((p, row) => {
			${buildDecoderInner(mappingInstructions)}
			return p;
		}, []));`
			: `
			const p = [];
			const row = data;
			${buildDecoderInner(mappingInstructions)}
			await Promise.all(p);
		`,
	);
};

// export const buildDecoder = (mappingInstructions: DrizzleS3FileOutputMappingInstruction[]): DecoderFunction => {
// 	if (!mappingInstructions.length) return () => undefined as any;

// 	return new AsyncFunction(
// 		's3',
// 		'data',
// 		'errors',
// 		'downloader',
// 		'metagetter',
// 		'presigner',
// 		'idGetter',
// 		`await Promise.all(data.reduce((p, row) => {
// 				${
// 			mappingInstructions.map((i) => {
// 				const path = i.path.join('');
// 				const optPath = i.path.join('?.');

// 				return `if(row${optPath}) {
// 					${(i.arrayDimensions
// 					? `
// 						const arr = row${path}
// 						${
// 						buildFunctionArrayRecursion(
// 							i.arrayDimensions,
// 							`p.push((async () => {
// 								if(!arr || typeof arr !== 'string') return;

// 								const { key, bucket } = idGetter(arr);
// 								row${path}${buildArrayRecursionIndexAccess(i.arrayDimensions)} = await ${
// 								i.fetchMode === 'file' ? 'downloader' : i.fetchMode === 'meta' ? 'metagetter' : 'presigner'
// 							}({ key, bucket, s3, mode: ${JSON.stringify(i.fileMode)}, fileOnly: ${
// 								i.fetchMode === 'data' ? 'true' : 'false'
// 							}, options: ${JSON.stringify(i.options)} });
// 						})().catch((e) => errors.push(e)))`,
// 						)
// 					}
// 						`
// 					: `p.push((async () => {
// 						const str = row${path};
// 						if(typeof str !== 'string') return;

// 						const { key, bucket } = idGetter(str);
// 						row${path} = await ${
// 						i.fetchMode === 'file' ? 'downloader' : i.fetchMode === 'meta' ? 'metagetter' : 'presigner'
// 					}({ key, bucket, s3, mode: ${JSON.stringify(i.fileMode)}, fileOnly: ${
// 						i.fetchMode === 'data' ? 'true' : 'false'
// 					}, options: ${JSON.stringify(i.options)} });
// 						})().catch((e) => errors.push(e)));`)}
// 					}`;
// 			}).join('\n')
// 		}
// 				return p;
// 			}, []
// 			));
// 		`,
// 	);
// };

export const buildEncoder = (mappingInstructions: DrizzleS3FilePlaceholderMappingInstruction[]): EncoderFunction => {
	if (!mappingInstructions.length) return () => undefined as any;

	return new AsyncFunction(
		's3',
		'placeholders',
		'errors',
		'uploader',
		'idBuilder',
		`
			if(!placeholders) return;
			await Promise.all([
				${
			mappingInstructions.map((i) => {
				const path = `[${JSON.stringify(i.key)}]`;

				return i.arrayDimensions
					? `...(() => {
						const arr = placeholders${path};
						const p = [];
						${
						buildFunctionArrayRecursion(
							i.arrayDimensions,
							`p.push((async () => {
							if(!arr || typeof arr !== 'object') return;

							const { key, bucket, data } = arr;
							await uploader({ key, bucket, data, s3, mode: ${JSON.stringify(i.mode)} });
							placeholders${path}${buildArrayRecursionIndexAccess(i.arrayDimensions)} = idBuilder(arr);
						})().catch((e) => errors.push(e)))`,
						)
					}
						return p;
					})()`
					: `(async () => {
							const params = placeholders${path};
							if(!params || typeof params !== 'object') return;

							const { key, bucket, data } = params;
							await uploader({ key, bucket, data, s3, mode: ${JSON.stringify(i.mode)} });
							placeholders${path} = idBuilder(params);
						})().catch((e) => errors.push(e))`;
			}).join(',\n')
		}
			]);
		`,
	);
};

export type DrizzleS3FileMode = 'buffer' | 'hex' | 'base64' | 'uint8array';

export type DrizzleS3FileModeToData = {
	buffer: Buffer;
	hex: string;
	base64: string;
	uint8array: Uint8Array;
};

export type DrizzleS3FetchMode = 'file' | 'meta' | 'data' | 'presigned';

// export interface DrizzleS3FileOutputMappingInstruction {
// 	fileMode: DrizzleS3FileMode;
// 	fetchMode: DrizzleS3FetchMode;
// 	options?: RequestPresigningArguments;
// 	arrayDimensions?: number;
// 	path: string[];
// }

export type DrizzleS3FileOutputMappingInstructionNodeCommon = {
	path: string[];
};
export type DrizzleS3FileOutputMappingInstruction =
	| DrizzleS3FileOutputMappingInstructionIterableNode
	| DrizzleS3FileOutputMappingInstructionTerminalNode;

export type DrizzleS3FileOutputMappingInstructionTerminalNode =
	& DrizzleS3FileOutputMappingInstructionNodeCommon
	& {
		fileMode: DrizzleS3FileMode;
		fetchMode: DrizzleS3FetchMode;
		options?: RequestPresigningArguments;
		arrayDimensions?: number;
	};

export type DrizzleS3FileOutputMappingInstructionIterableNode =
	& DrizzleS3FileOutputMappingInstructionNodeCommon
	& {
		subinstructions: DrizzleS3FileOutputMappingInstruction[];
	};

export interface DrizzleS3FileInputMappingInstruction {
	mode: DrizzleS3FileMode;
	index: number;
	arrayDimensions?: number;
}

export interface DrizzleS3FilePlaceholderMappingInstruction {
	mode: DrizzleS3FileMode;
	key: string;
	arrayDimensions?: number;
}

export type RequestPresigningArguments = typeof getSignedUrl extends
	((client: any, command: any, options?: infer R) => any) ? R
	: Record<string, unknown>;

export interface DrizzleS3ObjectIdentification {
	key: string;
	bucket: string;
}

export interface S3ExtMeta {
	decoder?: DecoderFunction;
	encoder?: EncoderFunction;
}

export type DrizzleS3Object<TData extends string | Buffer | Uint8Array = string | Buffer | Uint8Array> = Simplify<
	& DrizzleS3ObjectIdentification
	& {
		data: TData;
	}
>;

export type DrizzleS3ObjectFile<TData extends string | Buffer | Uint8Array = string | Buffer | Uint8Array> = Simplify<
	& DrizzleS3ObjectIdentification
	& {
		data: TData;
	}
>;

// export type DrizzleS3ObjectMeta = Simplify<
// 	& DrizzleS3ObjectIdentification
// 	& {
// 		meta?: Record<string, unknown>;
// 	}
// >;

const separator = ':';

export function objectIdToText({ key, bucket }: DrizzleS3ObjectIdentification): string {
	return `${bucket}${separator}${key}`;
}

export function textToObjectId(text: string): DrizzleS3ObjectIdentification {
	const split = text.split(separator);

	if (split.length < 2) throw new Error(`Invalid S3 object identifier: "${text}". Expected: "bucket${separator}key"`);

	const bucket = split.shift()!;
	const key = split.join(separator);

	return { key, bucket };
}

export async function downloadFile(
	{ key, bucket, s3, mode, fileOnly }: {
		key: string;
		bucket: string;
		s3: S3Client;
		mode: DrizzleS3FileMode;
		fileOnly?: boolean;
	},
) {
	const res = await s3.send(
		new GetObjectCommand({
			Bucket: bucket,
			Key: key,
		}),
	);

	if (!res.Body) {
		throw new DrizzleError({
			message: `No data found in bucket "${bucket}" for key "${key}"`,
		});
	}

	let data;
	switch (mode) {
		case 'uint8array': {
			data = await res.Body.transformToByteArray();
			break;
		}
		case 'buffer': {
			data = Buffer.from(await res.Body.transformToByteArray());
			break;
		}
		default: {
			data = await res.Body.transformToString(mode);
			break;
		}
	}
	return fileOnly ? data : {
		key,
		bucket,
		data,
	};
}

// export async function downloadFileMeta({ key, bucket, s3 }: { key: string; bucket: string; s3: S3Client }) {
// 	const { Metadata: meta } = await s3.send(
// 		new HeadObjectCommand({
// 			Bucket: bucket,
// 			Key: key,
// 		}),
// 	);

// 	return {
// 		key,
// 		bucket,
// 		meta,
// 	};
// }

export async function presignDownload(
	{ key, bucket, options, s3 }: { key: string; bucket: string; options?: RequestPresigningArguments; s3: S3Client },
) {
	const command = new GetObjectCommand({
		Bucket: bucket,
		Key: key,
	});

	const presigner = await PresignerImporter.importPresigner();
	// Types are compatible, errors seem to be caused by internal package issues
	const url = await presigner(s3 as any, command as any, options);

	return url;
}

export async function uploadFile(
	{ key, bucket, data, s3, mode }: {
		key: string;
		bucket: string;
		data: DrizzleS3Object['data'];
		s3: S3Client;
		mode: DrizzleS3FileMode;
	},
) {
	let body: Buffer | Uint8Array;
	switch (mode) {
		case 'uint8array':
		case 'buffer': {
			body = data as Buffer | Uint8Array;
			break;
		}
		case 'hex': {
			body = Uint8Array.fromHex ? Uint8Array.fromHex(data as string) : Buffer.from(data as string, 'hex');
			break;
		}
		case 'base64': {
			body = Uint8Array.fromBase64 ? Uint8Array.fromBase64(data as string) : Buffer.from(data as string, 'base64');
			break;
		}
	}

	const res = await s3.send(
		new PutObjectCommand({
			Bucket: bucket,
			Key: key,
			Body: body,
		}),
	);

	return res;
}

type RecursiveArrayItem = DrizzleS3Object | RecursiveArrayItem[];

export function mapArrayParam(
	s3: S3Client,
	item: RecursiveArrayItem,
	dimensions: number,
	mode: DrizzleS3FileMode,
	errors: unknown[],
	promises: Promise<unknown>[],
) {
	if (dimensions > 1) {
		for (const sub of item as Exclude<RecursiveArrayItem, DrizzleS3Object>) {
			mapArrayParam(s3, sub, dimensions - 1, mode, errors, promises);
		}

		return;
	}

	let i = 0;
	for (const param of item as (DrizzleS3Object | unknown)[]) {
		if (!param || typeof param !== 'object') {
			++i;
			continue;
		}
		const obj = param as DrizzleS3Object;

		promises.push(
			(async (i: number) => {
				await uploadFile({
					s3: s3,
					key: obj.key,
					bucket: obj.bucket,
					data: obj.data,
					mode: mode,
				});

				const value = objectIdToText(obj);
				(item as unknown[])[i] = value;
			})(i++).catch((e) => errors.push(e)),
		);
	}
}

export async function mapParams(
	s3: S3Client,
	params: unknown[],
	indexes: DrizzleS3FileInputMappingInstruction[],
	errors: unknown[],
) {
	if (!indexes.length) return;

	const arrayIdxs: number[] = [];
	await Promise.all(
		indexes.reduce((p, { index, mode, arrayDimensions }) => {
			const { value: param } = params![index]! as ExtensionParam<DrizzleS3Object, string>;

			if (arrayDimensions) {
				mapArrayParam(s3, param, arrayDimensions, mode, errors, p);
				arrayIdxs.push(index);

				return p;
			}

			if (!param || typeof param !== 'object') return p;

			p.push(
				(async (i: number) => {
					await uploadFile({
						s3: s3,
						key: param.key,
						bucket: param.bucket,
						data: param.data,
						mode: mode,
					});

					const value = objectIdToText(param);
					params![i] = value;
				})(index).catch((e) => errors.push(e)),
			);

			return p;
		}, [] as Promise<unknown>[]),
	);

	for (const idx of arrayIdxs) {
		params[idx] = (<ExtensionParam<any[]>> params[idx]).value
			? (<ExtensionParam> params[idx]).encoder.mapToDriverValue(
				(<ExtensionParam<any[]>> params[idx]).value,
			)
			: params[idx];
	}
}
