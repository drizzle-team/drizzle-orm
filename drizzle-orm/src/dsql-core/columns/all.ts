import { bigint } from './bigint.ts';
import { boolean } from './boolean.ts';
import { bytea } from './bytea.ts';
import { char } from './char.ts';
import { date } from './date.ts';
import { doublePrecision } from './doublePrecision.ts';
import { integer } from './integer.ts';
import { interval } from './interval.ts';
import { numeric } from './numeric.ts';
import { real } from './real.ts';
import { smallint } from './smallint.ts';
import { text } from './text.ts';
import { time } from './time.ts';
import { timestamp } from './timestamp.ts';
import { uuid } from './uuid.ts';
import { varchar } from './varchar.ts';

export function getDSQLColumnBuilders() {
	return {
		bigint,
		boolean,
		bytea,
		char,
		date,
		doublePrecision,
		integer,
		interval,
		numeric,
		real,
		smallint,
		text,
		time,
		timestamp,
		uuid,
		varchar,
	};
}

export type DSQLColumnsBuilders = ReturnType<typeof getDSQLColumnBuilders>;
