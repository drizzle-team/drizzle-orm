import { blob } from './blob';
import { customType } from './custom';
import { integer } from './integer';
import { numeric } from './numeric';
import { real } from './real';
import { text } from './text';

export function getSQLiteColumnBuilders() {
	return {
		blob,
		customType,
		integer,
		numeric,
		real,
		text,
	};
}

export type SQLiteColumnBuilders = ReturnType<typeof getSQLiteColumnBuilders>;
