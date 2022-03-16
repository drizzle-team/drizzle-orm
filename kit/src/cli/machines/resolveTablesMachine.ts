import { assign, createMachine, send } from 'xstate';
import { Named, RenamedObject } from '../components-api';

type Event =
  | { type: 'CHOICE_ITEM', itemIndex: number }
  | { type: 'DELETED' }
  | { type: 'RENAMED' }
  | { type: 'CANCEL' }
  | { type: 'CONFIRM' }
  | { type: 'NEXT' }
  | { type: 'CHOICE_NEW_ITEM'; itemIndex: number };

interface Context<T extends Named> extends CreateTablesMachineProps<T> {
  missingItemIndex: number,
  newItemIndex: number,
  createdTables: T[];
  renamedTables: RenamedObject<T>[];
  deletedTables: T[];
}

export interface CreateTablesMachineProps<T> {
  missingTables: T[],
  newTables: T[],
}

const createResolveTablesMachine = <T extends Named>(props: CreateTablesMachineProps<T>) => (
  createMachine<Context<T>, Event>({
    id: 'resolveTables',
    initial: 'idle',
    context: {
      ...props,
      missingItemIndex: 0,
      newItemIndex: 0,
      createdTables: [],
      renamedTables: [],
      deletedTables: [],
    },
    states: {
      idle: {
        entry: send({ type: 'NEXT' }),
        on: {
          NEXT: [
            {
              target: 'done',
              cond: 'isResolved',
              actions: ['resolveRemaining'],
            },
            {
              target: 'table',
            },
          ],
        },
      },
      table: {
        on: {
          CHOICE_ITEM: { target: 'action', actions: ['choseItem'] },
        },
      },
      action: {
        initial: 'actionChoice',
        states: {
          actionChoice: {
            on: { DELETED: '#resolveTables.confirmationDelete', RENAMED: 'rename' },
          },
          rename: {
            on: {
              CHOICE_NEW_ITEM: { target: '#resolveTables.confirmationRename', actions: ['choseNewItem'] },
            },
          },
        },
      },
      confirmationDelete: {
        on: {
          CANCEL: 'action.actionChoice',
          CONFIRM: [
            { target: 'check', actions: ['delete'] },
          ],
        },
      },
      confirmationRename: {
        on: {
          CANCEL: 'action.actionChoice',
          CONFIRM: [
            { target: 'check', actions: ['rename'] },
          ],
        },
      },
      check: {
        entry: send({ type: 'NEXT' }),
        on: {
          NEXT: [
            {
              target: 'done',
              cond: 'isResolved',
              actions: ['resolveRemaining'],
            },
            {
              target: 'table',
            },
          ],
        },
      },
      done: {},
    },
  },
  {
    guards: {
      isResolved: ({ missingTables, newTables }) => !missingTables.length || !newTables.length,
    },
    actions: {
      choseItem: assign({
        missingItemIndex: (context, event) => (event.type === 'CHOICE_ITEM' ? event.itemIndex : 0),
      }),

      choseNewItem: assign({
        newItemIndex: (context, event) => (event.type === 'CHOICE_NEW_ITEM' ? event.itemIndex : 0),
      }),

      delete: assign({
        deletedTables: ({
          missingItemIndex,
          deletedTables,
          missingTables,
        }) => [...deletedTables, missingTables[missingItemIndex]],
        missingTables: ({
          missingItemIndex,
          missingTables,
        }) => missingTables.filter((_, index) => index !== missingItemIndex),
      }),

      rename: assign({
        renamedTables: ({
          missingItemIndex,
          newItemIndex,
          renamedTables,
          newTables,
          missingTables,
        }) => [
          ...renamedTables,
          {from: missingTables[missingItemIndex], to: newTables[newItemIndex]},
        ],
        missingTables: ({
          missingItemIndex,
          missingTables,
        }) => missingTables.filter((_, index) => index !== missingItemIndex),
        newTables: ({
          newItemIndex,
          newTables,
        }) => newTables.filter((_, index) => index !== newItemIndex),
      }),

      resolveRemaining: assign({
        createdTables: ({
          newTables,
          createdTables,
        }) => [...createdTables, ...newTables],
        deletedTables: ({
          missingTables,
          deletedTables,
        }) => [...deletedTables, ...missingTables],
        missingTables: (context) => [],
        newTables: (context) => [],
      }),
    }
  }));

export default createResolveTablesMachine;
