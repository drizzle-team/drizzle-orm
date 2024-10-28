import { bigint } from './bigint.ts';
import { bigserial } from './bigserial.ts';
import { boolean } from './boolean.ts';
import { char } from './char.ts';
import { cidr } from './cidr.ts';
import { customType } from './custom.ts';
import { date } from './date.ts';
import { doublePrecision } from './double-precision.ts';
import { inet } from './inet.ts';
import { integer } from './integer.ts';
import { interval } from './interval.ts';
import { json } from './json.ts';
import { jsonb } from './jsonb.ts';
import { line } from './line.ts';
import { macaddr } from './macaddr.ts';
import { macaddr8 } from './macaddr8.ts';
import { numeric } from './numeric.ts';
import { point } from './point.ts';
import { geometry } from './postgis_extension/geometry.ts';
import { real } from './real.ts';
import { serial } from './serial.ts';
import { smallint } from './smallint.ts';
import { smallserial } from './smallserial.ts';
import { text } from './text.ts';
import { time } from './time.ts';
import { timestamp } from './timestamp.ts';
import { uuid } from './uuid.ts';
import { varchar } from './varchar.ts';
import { bit } from './vector_extension/bit.ts';
import { halfvec } from './vector_extension/halfvec.ts';
import { sparsevec } from './vector_extension/sparsevec.ts';
import { vector } from './vector_extension/vector.ts';

export function getPgColumnBuilders() {
	return {
		bigint,
		bigserial,
		boolean,
		char,
		cidr,
		customType,
		date,
		doublePrecision,
		inet,
		integer,
		interval,
		json,
		jsonb,
		line,
		macaddr,
		macaddr8,
		numeric,
		point,
		geometry,
		real,
		serial,
		smallint,
		smallserial,
		text,
		time,
		timestamp,
		uuid,
		varchar,
		bit,
		halfvec,
		sparsevec,
		vector,
	};
}

export type PgColumnsBuilders = ReturnType<typeof getPgColumnBuilders>;
