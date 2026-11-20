import { refineCodecs, unsupportedCodec } from '~/codecs.ts';
import type { PgCodecs, PostgresType } from '~/pg-core/codecs.ts';
import { postgresCodecs } from '../codecs.ts';

const driver = 'postgres/aurora';
const timeTzReason =
	'Data API converts `timetz` values to UTC dropping their offset and accepts no per-query result formats';
const timestamptzTextReason =
	'Data API converts `timestamptz` values to UTC, dropping the offset the server formats in '
	+ "the session's time zone, and accepts no per-query result formats";
const byteaArrayReason = 'Data API has no array type for binary values and returns `bytea[]` empty';

const unsupported = (type: string, reason: string) => {
	const normalize = unsupportedCodec(type, driver, reason);
	return { normalize, normalizeArray: normalize };
};

/** Variant of {@link postgresCodecs} for AWS Data API, which formats values itself with no per-query alternative */
export const postgresAuroraCodecs: PgCodecs = refineCodecs<PostgresType>(postgresCodecs, {
	bytea: { normalizeArray: unsupportedCodec('bytea[]', driver, byteaArrayReason) },
	timetz: unsupported('time with time zone', timeTzReason),
	'timestamptz:string': unsupported('timestamp with time zone', timestamptzTextReason),
});
