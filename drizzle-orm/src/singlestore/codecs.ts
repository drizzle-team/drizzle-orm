import {
	castToDouble,
	castToText,
	floatFromDouble,
	refineGenericSingleStoreCodecs,
	vectorNormalizer,
} from '~/singlestore-core/codecs.ts';

export const singleStoreCodecs = refineGenericSingleStoreCodecs({
	serial: {
		cast: castToText,
		normalize: Number,
	},
	bigint: {
		cast: castToText,
		normalize: BigInt,
	},
	'bigint:number': {
		cast: castToText,
		normalize: Number,
	},
	'bigint:string': {
		cast: castToText,
	},
	boolean: {
		normalize: (value: number) => value === 1,
	},
	date: {
		normalize: (value: string) => new Date(value),
	},
	datetime: {
		normalize: (value: string) => new Date(value.replace(' ', 'T') + 'Z'),
	},
	timestamp: {
		normalize: (value: string) => new Date(value + '+0000'),
	},
	'decimal:number': {
		normalize: Number,
	},
	'decimal:bigint': {
		normalize: BigInt,
	},
	float: {
		cast: castToDouble,
		normalize: floatFromDouble,
	},
	binary: {
		normalize: (value: Buffer) => value.toString(),
	},
	varbinary: {
		normalize: (value: Buffer) => value.toString(),
	},
	vector_i8: {
		normalize: vectorNormalizer('I8'),
	},
	vector_i16: {
		normalize: vectorNormalizer('I16'),
	},
	vector_i32: {
		normalize: vectorNormalizer('I32'),
	},
	vector_i64: {
		normalize: vectorNormalizer('I64'),
	},
	vector_f32: {
		normalize: vectorNormalizer('F32'),
	},
	vector_f64: {
		normalize: vectorNormalizer('F64'),
	},
});
