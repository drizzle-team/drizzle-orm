import { bigint, int8 } from './bigint.ts';
import { bit } from './bit.ts';
import { bool } from './bool.ts';
import { char } from './char.ts';
import { customType } from './custom.ts';
import { date } from './date.ts';
import { decimal, numeric } from './decimal.ts';
import { doublePrecision, float } from './float.ts';
import { geometry } from './geometry.ts';
import { inet } from './inet.ts';
import { int4 } from './integer.ts';
import { interval } from './interval.ts';
import { jsonb } from './jsonb.ts';
import { real } from './real.ts';
import { int2, smallint } from './smallint.ts';
import { string, text } from './string.ts';
import { time } from './time.ts';
import { timestamp } from './timestamp.ts';
import { uuid } from './uuid.ts';
import { varbit } from './varbit.ts';
import { varchar } from './varchar.ts';
import { vector } from './vector.ts';

export function getCockroachColumnBuilders() {
	return {
		bigint,
		bool,
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
		varbit,
	};
}

export type CockroachColumnsBuilders = ReturnType<typeof getCockroachColumnBuilders>;
