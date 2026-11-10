// Geometric + extension type decoders for shapes: built-in `point`/`line` and pgvector. pgvector
// types have DYNAMIC OIDs (created per database), so each one is a defineType() definition that the
// column plan carries. The declaration chooses the decoder, never the runtime OID. All are
// TEXT-wire-format decoders.
import type { CodegenCol } from './decode.ts';
import { defineType } from './registry.ts';

export const OID_POINT = 600;
export const OID_LINE = 628; // built-in `line`: text is '{A,B,C}' (Ax + By + C = 0)

// ---- point: text is "(x,y)" --------------------------------------------------------------
export const parsePoint = (s: string): { x: number; y: number } => {
	const c = s.indexOf(',');
	return { x: Number(s.slice(1, c)), y: Number(s.slice(c + 1, -1)) };
};
export const parsePointTuple = (s: string): [number, number] => {
	const c = s.indexOf(',');
	return [Number(s.slice(1, c)), Number(s.slice(c + 1, -1))];
};

// ---- line: text is "{A,B,C}" (coefficients of Ax + By + C = 0) ------------------------------
export const parseLineAbc = (s: string): { a: number; b: number; c: number } => {
	const c1 = s.indexOf(','), c2 = s.indexOf(',', c1 + 1);
	return { a: Number(s.slice(1, c1)), b: Number(s.slice(c1 + 1, c2)), c: Number(s.slice(c2 + 1, -1)) };
};
export const parseLineTuple = (s: string): [number, number, number] => {
	const c1 = s.indexOf(','), c2 = s.indexOf(',', c1 + 1);
	return [Number(s.slice(1, c1)), Number(s.slice(c1 + 1, c2)), Number(s.slice(c2 + 1, -1))];
};

// ---- vector: text is "[1,2.5,3]" (valid JSON) ----------------------------------------------
export const parseVector = (s: string): number[] => JSON.parse(s) as number[];

// ---- sparsevec: text is '{1:1.5,3:2}/5' (1-based indices / dimension) -----------------------
export interface SparseVec {
	dim: number;
	indices: number[];
	values: number[];
}
export function parseSparsevec(s: string): SparseVec {
	const slash = s.lastIndexOf('/');
	const dim = Number(s.slice(slash + 1));
	const body = s.slice(1, slash - 1); // strip '{' and '}'
	const indices: number[] = [], values: number[] = [];
	if (body.length) {
		for (const pair of body.split(',')) {
			const c = pair.indexOf(':');
			indices.push(Number(pair.slice(0, c)));
			values.push(Number(pair.slice(c + 1)));
		}
	}
	return { dim, indices, values };
}
export function sparseToDense(v: SparseVec): number[] {
	const out = new Array<number>(v.dim).fill(0);
	for (let i = 0; i < v.indices.length; i++) out[v.indices[i]! - 1] = v.values[i]!; // 1-based
	return out;
}

// ---- pgvector definitions: bare / unknown targets yield the raw text ------------------------
const vectorTargets = {
	array: parseVector,
	f32: (s: string) => Float32Array.from(JSON.parse(s) as number[]),
};
export const VECTOR_DEF = defineType('vector', { ascii: true, targets: vectorTargets }).def;
export const HALFVEC_DEF = defineType('halfvec', { ascii: true, targets: vectorTargets }).def; // same '[…]' text as vector
export const SPARSEVEC_DEF = defineType('sparsevec', {
	ascii: true,
	targets: { sparse: parseSparsevec, array: (s: string) => sparseToDense(parseSparsevec(s)) },
}).def;

// ---- point / line shape-column dispatcher (shared by BOTH decode engines) ------------------
type AtDecoder = (b: Buffer, o: number, l: number) => unknown;

/** Decoder for a built-in point/line shape column. Claims ONLY explicit parse targets. Bare
 *  declarations ('point', 'line') default to the raw TEXT string via the normal string machinery
 *  (returning null here). Parsing is opt-in per column. */
export function extAt(col: Pick<CodegenCol, 'oid' | 'js'>): AtDecoder | null {
	const js = col.js as string | undefined;
	switch (col.oid) {
		case OID_POINT:
			if (js === 'xy') return (b, o, l) => parsePoint(b.toString('utf8', o, o + l));
			if (js === 'tuple') return (b, o, l) => parsePointTuple(b.toString('utf8', o, o + l));
			return null; // bare / :string -> raw '(x,y)' text
		case OID_LINE:
			if (js === 'abc') return (b, o, l) => parseLineAbc(b.toString('utf8', o, o + l));
			if (js === 'tuple') return (b, o, l) => parseLineTuple(b.toString('utf8', o, o + l));
			return null; // bare / :string -> raw '{A,B,C}' text
		default:
			return null;
	}
}

/** String-leaf for one point/line ARRAY ELEMENT ('{…}' array literals carry element TEXT). It
 *  mirrors extAt's target mapping exactly. null = target not parseable for this type (bare/raw). */
export function extLeafFor(elem: number, js?: string): ((s: string) => unknown) | null {
	switch (elem) {
		case OID_POINT:
			return js === 'xy' ? parsePoint : js === 'tuple' ? parsePointTuple : null;
		case OID_LINE:
			return js === 'abc' ? parseLineAbc : js === 'tuple' ? parseLineTuple : null;
		default:
			return null;
	}
}
