import { refineGenericMySqlCodecs } from '~/mysql-core/codecs.ts';
import { textDecoder } from '~/utils.ts';

const bitStringFromBytes = (value: Uint8Array): string => {
	const str: string[] = Array.from({ length: value.length });
	for (let i = 0; i < value.length; ++i) {
		str[i] = value[i] === 49 ? '1' : '0';
	}
	return str.join('');
};

export const tidbCodecs = refineGenericMySqlCodecs({
	serial: {
		normalize: Number,
	},
	bigint: {
		normalize: BigInt,
	},
	'bigint:number': {
		normalize: Number,
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
	binary: {
		normalize: bitStringFromBytes,
	},
	varbinary: {
		normalize: bitStringFromBytes,
	},
	blob: {
		normalize: typeof Buffer === 'undefined'
			? textDecoder ? ((value: Uint8Array) => textDecoder!.decode(value)) : undefined
			: (value: Uint8Array) => Buffer.from(value).toString('utf8'),
	},
	tinyblob: {
		normalize: typeof Buffer === 'undefined'
			? textDecoder ? ((value: Uint8Array) => textDecoder!.decode(value)) : undefined
			: (value: Uint8Array) => Buffer.from(value).toString('utf8'),
	},
	mediumblob: {
		normalize: typeof Buffer === 'undefined'
			? textDecoder ? ((value: Uint8Array) => textDecoder!.decode(value)) : undefined
			: (value: Uint8Array) => Buffer.from(value).toString('utf8'),
	},
	longblob: {
		normalize: typeof Buffer === 'undefined'
			? textDecoder ? ((value: Uint8Array) => textDecoder!.decode(value)) : undefined
			: (value: Uint8Array) => Buffer.from(value).toString('utf8'),
	},
	'blob:buffer': {
		normalize: typeof Buffer === 'undefined' ? undefined : (value: Uint8Array) => Buffer.from(value),
	},
	'tinyblob:buffer': {
		normalize: typeof Buffer === 'undefined' ? undefined : (value: Uint8Array) => Buffer.from(value),
	},
	'mediumblob:buffer': {
		normalize: typeof Buffer === 'undefined' ? undefined : (value: Uint8Array) => Buffer.from(value),
	},
	'longblob:buffer': {
		normalize: typeof Buffer === 'undefined' ? undefined : (value: Uint8Array) => Buffer.from(value),
	},
});
