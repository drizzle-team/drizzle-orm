import { bigintFromIntegerValue, unsupportedCodec } from '~/codecs.ts';
import { refineGenericMsSqlCodecs } from '~/mssql-core/codecs.ts';

const driver = 'mssql';
const decimalReason = 'the driver decodes `decimal`, `numeric` values to numbers, losing precision, '
	+ "and has no option to return them as text; use `mode: 'number'`";

export const nodeMssqlCodecs = refineGenericMsSqlCodecs({
	bigint: {
		normalize: BigInt,
	},
	'bigint:number': {
		normalize: Number,
	},
	decimal: {
		normalize: unsupportedCodec('decimal', driver, decimalReason),
	},
	'decimal:number': {
		normalize: Number,
	},
	'decimal:bigint': {
		normalize: bigintFromIntegerValue('decimal', driver),
	},
	numeric: {
		normalize: unsupportedCodec('numeric', driver, decimalReason),
	},
	'numeric:number': {
		normalize: Number,
	},
	'numeric:bigint': {
		normalize: bigintFromIntegerValue('numeric', driver),
	},
});
