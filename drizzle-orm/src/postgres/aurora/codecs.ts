import { refineCodecs } from '~/codecs.ts';
import { castToText, castToTextArr, type PgCodecs, type PostgresType } from '~/pg-core/codecs.ts';
import { postgresShapeCodecs } from '../codecs.ts';

/** Variant of {@link postgresShapeCodecs} for AWS Data API, which has no array type for binary values,
 * so `bytea[]` comes back empty unless selected as text
 */
export const postgresAuroraShapeCodecs: PgCodecs = refineCodecs<PostgresType>(postgresShapeCodecs, {
	bytea: { castArray: castToTextArr },
	// Data API's own formatting fails on `timestamptz` values with 5+ digit years or seconds-precision offsets,
	// drops the `BC` suffix of `timestamp`s with fractional seconds and cuts `time` to milliseconds, text keeps them
	time: { cast: castToText, castArray: castToTextArr },
	// Data API's driver keeps `DateStyle` ISO, so text arrays decode by their declared type
	date: { castArray: undefined, normalizeArray: undefined },
	timestamp: { cast: castToText, castArray: castToTextArr, normalizeArray: undefined },
	'timestamp:string': { cast: castToText, castArray: castToTextArr },
	timestamptz: { cast: castToText, castArray: castToTextArr, normalizeArray: undefined },
	'timestamptz:string': { cast: castToText, castArray: castToTextArr },
	timetz: { cast: castToText, castArray: castToTextArr },
});
