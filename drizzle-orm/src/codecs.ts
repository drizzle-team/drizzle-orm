import type { SQLChunk } from './sql/sql.ts';

export type NormalizeCodec = (value: any) => any;
export type NormalizeArrayCodec = (value: any, arrayDimensions: number) => any;
export type CastCodec = (name: SQLChunk) => SQLChunk;
export type CastArrayCodec = (name: SQLChunk, arrayDimensions: number) => SQLChunk;
