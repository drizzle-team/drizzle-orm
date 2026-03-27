import pgClient from 'postgres';
import { expect, test } from 'vitest';
import { makePgArray } from '~/pg-core';
import { PostgresType } from '~/pg-core/codecs';

const db = pgClient('postgres://postgres:postgres@localhost:55433/drizzle');

export type NormalizeCodec = (value: any) => any;
export type NormalizeArrayCodec = (value: any, arrayDimensions: number) => any;
export type CastCodec = (name: string) => string;
export type CastArrayCodec = (name: string, arrayDimensions: number) => string;
export type CastParamCodec = (name: string) => string;
export type CastArrayParamCodec = (name: string, arrayDimensions: number) => string;

export type Codec = {
	cast: CastCodec;
	castArray: CastArrayCodec;
	castInJson: CastCodec;
	castArrayInJson: CastArrayCodec;

	castParam: CastParamCodec;
	castArrayParam: CastArrayParamCodec;

	normalize?: NormalizeCodec | undefined;
	normalizeArray?: NormalizeArrayCodec | undefined;
	normalizeInJson?: NormalizeCodec | undefined;
	normalizeArrayInJson?: NormalizeArrayCodec | undefined;

	normalizeParam?: NormalizeCodec | undefined;
	normalizeParamArray?: NormalizeArrayCodec | undefined;
};

export const jsonColumnCodec: Codec = {
	cast: (v) => v,
	castArray: (v) => v,
	castArrayInJson: (v) => v,
	castArrayParam: (v) => v,
	castInJson: (v) => v,
	castParam: (v) => v,
	normalizeParam: (v) => JSON.stringify(v),
	normalizeParamArray: (v, _dimensions) => makePgArray(v.map((e: any) => JSON.stringify(e))),
	normalize: (v) => JSON.parse(v),
	normalizeInJson: (v) => JSON.parse(v),
};

export const someDriverCodecs: Partial<Record<PostgresType, Codec>> = {
	json: jsonColumnCodec,
	jsonb: jsonColumnCodec,
};

await db.unsafe('DROP TABLE IF EXISTS test CASCADE;');

test('all', async () => {
	await db.unsafe(`CREATE TABLE test (
            subject JSON,
            subject_arr JSON[]
        );`);

	const subjectValue = { string: 'value', number: 1, null: null };
	const subjectArrayValue = [{ string: 'value', number: 1, null: null }, { value: 2 }, ['nestedArr']];

	const input = [
		jsonColumnCodec.normalizeParam!(subjectValue),
		jsonColumnCodec.normalizeParamArray!(subjectArrayValue, 1),
	];

	await db.unsafe(
		`INSERT INTO test(subject, subject_arr) VALUES (${jsonColumnCodec.castParam('$1')}, ${
			jsonColumnCodec.castParam('$2')
		})`,
		input,
	);

	const res = await db.unsafe(
		`SELECT ${jsonColumnCodec.cast('subject')}, ${jsonColumnCodec.cast('subject_arr')} FROM test;`,
	)
		.values();

	const [[subject, subjectArr]] = res as any;
	const mappedSubject = jsonColumnCodec.normalize ? jsonColumnCodec.normalize(subject) : subject;
	const mappedSubjectArr = jsonColumnCodec.normalizeArray
		? jsonColumnCodec.normalizeArray(subjectArr, 1)
		: subjectArr;

	expect(mappedSubject).toStrictEqual(subjectValue);
	expect(mappedSubjectArr).toStrictEqual(subjectArrayValue);

	const jsonRes = await db.unsafe(
		`SELECT row_to_json(r.*) FROM (SELECT ${jsonColumnCodec.castArrayInJson('subject', 1)} as "jsonSubject", ${
			jsonColumnCodec.castArrayInJson('subject_arr', 1)
		} as "jsonSubjectArr" FROM test ) r;`,
	) as any;

	const { jsonSubject, jsonSubjectArr } = jsonRes[0].row_to_json;

	const mappedJsonSubject = jsonColumnCodec.normalizeInJson
		? jsonColumnCodec.normalizeInJson(jsonSubject)
		: jsonSubject;
	const mappedJsonSubjectArr = jsonColumnCodec.normalizeArrayInJson
		? jsonColumnCodec.normalizeArrayInJson(jsonSubjectArr, 1)
		: jsonSubjectArr;

	expect(mappedJsonSubject).toStrictEqual(subjectValue);
	expect(mappedJsonSubjectArr).toStrictEqual(subjectArrayValue);
});
