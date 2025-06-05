import { bigint, int8 } from './bigint.ts';
import { boolean } from './boolean.ts';
import { char } from './char.ts';
import { customType } from './custom.ts';
import { date } from './date.ts';
import { doublePrecision } from './double-precision.ts';
import { inet } from './inet.ts';
import { int4 } from './integer.ts';
import { interval } from './interval.ts';
import { jsonb } from './jsonb.ts';
import { numeric } from './numeric.ts';
import { geometry } from './postgis_extension/geometry.ts';
import { real } from './real.ts';
import { int2, smallint } from './smallint.ts';
import { text } from './text.ts';
import { time } from './time.ts';
import { timestamp } from './timestamp.ts';
import { uuid } from './uuid.ts';
import { varchar } from './varchar.ts';
import { bit } from './vector_extension/bit.ts';
import { vector } from './vector_extension/vector.ts';

export function getCockroachDbColumnBuilders() {
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
	};
}

export type CockroachDbColumnsBuilders = ReturnType<typeof getCockroachDbColumnBuilders>;
