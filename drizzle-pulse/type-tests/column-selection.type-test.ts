import { expectTypeOf } from 'bun:test';
import type { ApplyColumns, InferColumnSelection } from '../src/server/pulse-types.js';

type Row = { id: number; name: string; email: string; password: string };

expectTypeOf<ApplyColumns<Row, { name: true; email: true }>>().toEqualTypeOf<{
  name: string;
  email: string;
}>();
expectTypeOf<ApplyColumns<Row, { password: false }>>().toEqualTypeOf<{
  id: number;
  name: string;
  email: string;
}>();
expectTypeOf<ApplyColumns<Row, Record<never, never>>>().toEqualTypeOf<Row>();
expectTypeOf<ApplyColumns<Row, { name: true; password: false }>>().toEqualTypeOf<{
  name: string;
}>();

expectTypeOf<InferColumnSelection<{ name: true; email: true }>>().toEqualTypeOf<'name' | 'email'>();
expectTypeOf<InferColumnSelection<{ password: false }>>().toEqualTypeOf<never>();
expectTypeOf<InferColumnSelection<{ name: true; password: false }>>().toEqualTypeOf<'name'>();
