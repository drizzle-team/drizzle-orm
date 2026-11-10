import fc from 'fast-check';
import type { HarnessOrderStatus } from '../fixtures/full-orders/index.js';

export type GeneratedStep = {
  kind: 'insert' | 'update' | 'delete';
  targetHint: number;
  status: HarnessOrderStatus;
  priceCents: number;
  assignDriver: boolean;
  touchStatus: boolean;
  touchPrice: boolean;
  touchDriver: boolean;
};

export type InsertOp = {
  type: 'insert';
  ref: number;
  status: HarnessOrderStatus;
  price: number;
  assignDriver: boolean;
};

export type UpdateOp = {
  type: 'update';
  ref: number;
  status?: HarnessOrderStatus;
  price?: number;
  driverMode?: 'set' | 'clear';
};

export type DeleteOp = { type: 'delete'; ref: number };

export type GeneratedOperation = InsertOp | UpdateOp | DeleteOp;

const statusArb = fc.constantFrom<HarnessOrderStatus>(
  'requested',
  'accepted',
  'completed',
  'cancelled',
);

const generatedStepArb = fc.record<GeneratedStep>({
  kind: fc.constantFrom('insert', 'update', 'delete'),
  targetHint: fc.nat(100),
  status: statusArb,
  priceCents: fc.integer({ min: 500, max: 20_000 }),
  assignDriver: fc.boolean(),
  touchStatus: fc.boolean(),
  touchPrice: fc.boolean(),
  touchDriver: fc.boolean(),
});

export function normalizeSteps(steps: ReadonlyArray<GeneratedStep>): GeneratedOperation[] {
  const operations: GeneratedOperation[] = [];
  const liveRefs: number[] = [];
  let nextRef = 1;

  for (const step of steps) {
    if (step.kind === 'insert' || liveRefs.length === 0) {
      const ref = nextRef;
      nextRef += 1;
      liveRefs.push(ref);
      operations.push({
        type: 'insert',
        ref,
        status: step.status,
        price: step.priceCents / 100,
        assignDriver: step.assignDriver,
      });
      continue;
    }

    const targetIndex = step.targetHint % liveRefs.length;
    const targetRef = liveRefs[targetIndex];
    if (targetRef === undefined) {
      continue;
    }

    if (step.kind === 'update') {
      const updateOp: UpdateOp = { type: 'update', ref: targetRef };
      if (step.touchStatus) {
        updateOp.status = step.status;
      }
      if (step.touchPrice) {
        updateOp.price = step.priceCents / 100;
      }
      if (step.touchDriver) {
        updateOp.driverMode = step.assignDriver ? 'set' : 'clear';
      }
      if (
        updateOp.status === undefined &&
        updateOp.price === undefined &&
        updateOp.driverMode === undefined
      ) {
        updateOp.status = step.status;
      }
      operations.push(updateOp);
      continue;
    }

    operations.push({ type: 'delete', ref: targetRef });
    liveRefs.splice(targetIndex, 1);
  }

  return operations;
}

export function makeOperationSequenceArb({
  minLength,
  maxLength,
}: {
  minLength: number;
  maxLength: number;
}): fc.Arbitrary<GeneratedOperation[]> {
  return fc.array(generatedStepArb, { minLength, maxLength }).map((steps) => normalizeSteps(steps));
}
