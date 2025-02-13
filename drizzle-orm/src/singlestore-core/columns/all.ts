import { bigint } from './bigint.ts';
import { binary } from './binary.ts';
import { boolean } from './boolean.ts';
import { char } from './char.ts';
import { customType } from './custom.ts';
import { date } from './date.ts';
import { datetime } from './datetime.ts';
import { decimal } from './decimal.ts';
import { double } from './double.ts';
import { singlestoreEnum } from './enum.ts';
import { float } from './float.ts';
import { int } from './int.ts';
import { json } from './json.ts';
import { mediumint } from './mediumint.ts';
import { real } from './real.ts';
import { serial } from './serial.ts';
import { smallint } from './smallint.ts';
import { longtext, mediumtext, text, tinytext } from './text.ts';
import { time } from './time.ts';
import { timestamp } from './timestamp.ts';
import { tinyint } from './tinyint.ts';
import { varbinary } from './varbinary.ts';
import { varchar } from './varchar.ts';
import { vector } from './vector.ts';
import { year } from './year.ts';

export function getSingleStoreColumnBuilders() {
	return {
		bigint,
		binary,
		boolean,
		char,
		customType,
		date,
		datetime,
		decimal,
		double,
		singlestoreEnum,
		float,
		int,
		json,
		mediumint,
		real,
		serial,
		smallint,
		longtext,
		mediumtext,
		text,
		tinytext,
		time,
		timestamp,
		tinyint,
		varbinary,
		varchar,
		vector,
		year,
	};
}

export type SingleStoreColumnBuilders = ReturnType<typeof getSingleStoreColumnBuilders>;
