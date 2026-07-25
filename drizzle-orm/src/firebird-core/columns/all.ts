import { blob } from './blob.ts';
import { bigint } from './bigint.ts';
import { boolean } from './boolean.ts';
import { char } from './char.ts';
import { customType } from './custom.ts';
import { date } from './date.ts';
import { doublePrecision } from './double-precision.ts';
import { integer } from './integer.ts';
import { numeric, decimal } from './numeric.ts';
import { real } from './real.ts';
import { smallint } from './smallint.ts';
import { text } from './text.ts';
import { time } from './time.ts';
import { timestamp } from './timestamp.ts';
import { varchar } from './varchar.ts';

export function getFirebirdColumnBuilders() {
	return {
		bigint,
		blob,
		boolean,
		char,
		customType,
		date,
		decimal,
		doublePrecision,
		integer,
		numeric,
		real,
		smallint,
		text,
		time,
		timestamp,
		varchar,
	};
}

export type FirebirdColumnBuilders = ReturnType<typeof getFirebirdColumnBuilders>;
