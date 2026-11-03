import { refineCodecs } from '~/codecs.ts';
import {
	arrayCompatNormalize,
	byteaFromPgHex,
	castToText,
	castToTextArr,
	type PgCodecs,
	type PostgresType,
} from '~/pg-core/codecs.ts';
import { minipgCodecs, minipgShapeCodecs } from '../codecs.ts';

/** Variant of {@link minipgCodecs} for AWS Data API, which has no array type for binary values,
 * so `bytea[]` comes back empty unless selected as text; converts values with time zones to UTC dropping the offset
 */
export const minipgAuroraCodecs: PgCodecs = refineCodecs<PostgresType>(minipgCodecs, {
	bytea: {
		castArray: castToTextArr,
		normalizeArray: arrayCompatNormalize(byteaFromPgHex),
	},
	timetz: { cast: castToText, castArray: castToTextArr, normalizeArray: undefined },
});

/** Variant of {@link minipgShapeCodecs} for AWS Data API, see {@link minipgAuroraCodecs}
 *
 * Useless for overrides or on their own
 */
export const minipgAuroraShapeCodecs: PgCodecs = refineCodecs<PostgresType>(minipgShapeCodecs, {
	bytea: { castArray: castToTextArr },
	// Data API's own formatting fails on `timestamptz` values with 5+ digit years or seconds-precision offsets,
	// drops the `BC` suffix of `timestamp`s with fractional seconds and cuts `time` to milliseconds, text keeps them
	time: { cast: castToText, castArray: castToTextArr },
	timestamp: { cast: castToText, castArray: castToTextArr },
	'timestamp:string': { cast: castToText, castArray: castToTextArr },
	timestamptz: { cast: castToText, castArray: castToTextArr },
	'timestamptz:string': { cast: castToText, castArray: castToTextArr },
	timetz: { cast: castToText, castArray: castToTextArr },
});
