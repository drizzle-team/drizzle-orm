import { bigint } from './bigint.ts';
import { bigintT } from './bigintT.ts';
import { boolean } from './boolean.ts';
import { bytes } from './bytes.ts';
import { customType } from './custom.ts';
import { dateDuration } from './date-duration.ts';
import { decimal } from './decimal.ts';
import { doublePrecision } from './double-precision.ts';
import { duration } from './duration.ts';
import { integer } from './integer.ts';
import { json } from './json.ts';
import { localDate } from './localdate.ts';
import { localTime } from './localtime.ts';
import { real } from './real.ts';
import { relDuration } from './relative-duration.ts';
import { smallint } from './smallint.ts';
import { text } from './text.ts';
import { timestamp } from './timestamp.ts';
import { timestamptz } from './timestamptz.ts';
import { uuid } from './uuid.ts';

// TODO add
export function getGelColumnBuilders() {
	return {
		localDate,
		localTime,
		decimal,
		dateDuration,
		bigintT,
		duration,
		relDuration,
		bytes,
		customType,
		bigint,
		boolean,
		doublePrecision,
		integer,
		json,
		real,
		smallint,
		text,
		timestamptz,
		uuid,
		timestamp,
	};
}

export type GelColumnsBuilders = ReturnType<typeof getGelColumnBuilders>;
