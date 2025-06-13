import { bigint, int8 } from './bigint.ts';
import { bit } from './bit.ts';
import { boolean } from './boolean.ts';
import { char } from './char.ts';
import { customType } from './custom.ts';
import { date } from './date.ts';
import { decimal, numeric } from './decimal.ts';
import { doublePrecision, float } from './float.ts';
import { inet } from './inet.ts';
import { int4 } from './integer.ts';
import { interval } from './interval.ts';
import { jsonb } from './jsonb.ts';
import { geometry } from './postgis_extension/geometry.ts';
import { real } from './real.ts';
import { int2, smallint } from './smallint.ts';
import { string, text } from './string.ts';
import { time } from './time.ts';
import { timestamp } from './timestamp.ts';
import { uuid } from './uuid.ts';
import { varchar } from './varchar.ts';
import { vector } from './vector.ts';

export function getCockroachColumnBuilders() {
	return {
		bigint,
		boolean,
		char,
		customType,
		date,
		doublePrecision,
		inet,
		int4,
		int2,
		int8,
		interval,
		jsonb,
		numeric,
		decimal,
		geometry,
		real,
		smallint,
		text,
		time,
		timestamp,
		uuid,
		varchar,
		bit,
		vector,
		float,
		string,
	};
}

export type CockroachColumnsBuilders = ReturnType<typeof getCockroachColumnBuilders>;
