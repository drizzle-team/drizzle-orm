import { bigint } from './bigint';
import { binary } from './binary';
import { boolean } from './boolean';
import { char } from './char';
import { customType } from './custom';
import { date } from './date';
import { datetime } from './datetime';
import { decimal } from './decimal';
import { double } from './double';
import { mysqlEnum } from './enum';
import { float } from './float';
import { int } from './int';
import { json } from './json';
import { mediumint } from './mediumint';
import { real } from './real';
import { serial } from './serial';
import { smallint } from './smallint';
import { text } from './text';
import { time } from './time';
import { timestamp } from './timestamp';
import { tinyint } from './tinyint';
import { varbinary } from './varbinary';
import { varchar } from './varchar';
import { year } from './year';

export function getMySqlColumnBuilders() {
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
		mysqlEnum,
		float,
		int,
		json,
		mediumint,
		real,
		serial,
		smallint,
		text,
		time,
		timestamp,
		tinyint,
		varbinary,
		varchar,
		year,
	};
}

export type MySqlColumnBuilders = ReturnType<typeof getMySqlColumnBuilders>;
