import { refineCodecs } from '~/codecs.ts';
import {
	arrayCompatNormalize,
	byteaFromPgHex,
	castToText,
	castToTextArr,
	type PgCodecs,
	type PostgresType,
} from '~/pg-core/codecs.ts';
import { postgresCodecs, postgresShapeCodecs } from '../codecs.ts';

/** Variant of {@link postgresCodecs} for AWS Data API, which has no array type for binary values,
 * so `bytea[]` comes back empty unless selected as text; converts values with time zones to UTC dropping the offset
 */
export const postgresAuroraCodecs: PgCodecs = refineCodecs<PostgresType>(postgresCodecs, {
	bytea: {
		castArray: castToTextArr,
		normalizeArray: arrayCompatNormalize(byteaFromPgHex),
	},
	timetz: { cast: castToText, castArray: castToTextArr, normalizeArray: undefined },
});

/** Variant of {@link postgresShapeCodecs} for AWS Data API, see {@link postgresAuroraCodecs}
 *
 * Useless for overrides or on their own
 */
export const postgresAuroraShapeCodecs: PgCodecs = refineCodecs<PostgresType>(postgresShapeCodecs, {
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
