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

export interface CreateColumnsMachineProps<T> {
  name: string;
  added: T[],
  deleted: T[],
}

interface Context<T> {
  tableName: string,
  addedColumns: T[],
  deletedColumns: T[],
  missingItemIndex: number,
  newItemIndex: number,
  created: T[];
  renamed: RenamedObject<T>[];
  deleted: T[];
}

const createResolveColumnsMachine = <T extends Named>(props: CreateColumnsMachineProps<T>) => (
  createMachine<Context<T>, Event>({
    id: 'resolveColumns',
    initial: 'idle',
    context: {
      tableName: props.name,
      addedColumns: props.added,
      deletedColumns: props.deleted,
      missingItemIndex: 0,
      newItemIndex: 0,
      created: [],
      renamed: [],
      deleted: [],
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
            on: { DELETED: '#resolveColumns.confirmationDelete', RENAMED: 'rename' },
          },
          rename: {
            on: {
              CHOICE_NEW_ITEM: { target: '#resolveColumns.confirmationRename', actions: ['choseNewItem'] },
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
      isResolved: ({ deletedColumns, addedColumns }) => !deletedColumns.length || !addedColumns.length,
    },
    actions: {
      choseItem: assign({
        missingItemIndex: (context, event) => (event.type === 'CHOICE_ITEM' ? event.itemIndex : 0),
      }),

      choseNewItem: assign({
        newItemIndex: (context, event) => (event.type === 'CHOICE_NEW_ITEM' ? event.itemIndex : 0),
      }),

      delete: assign({
        deleted: ({
          missingItemIndex,
          deleted,
          deletedColumns,
        }) => [...deleted, deletedColumns[missingItemIndex]],
        deletedColumns: ({
          missingItemIndex,
          deletedColumns,
        }) => deletedColumns.filter((_, index) => index !== missingItemIndex),
      }),

      rename: assign({
        renamed: ({
          missingItemIndex,
          newItemIndex,
          renamed,
          addedColumns,
          deletedColumns,
        }) => [
          ...renamed,
          { from: deletedColumns[missingItemIndex], to: addedColumns[newItemIndex] },
        ],
        deletedColumns: ({
          missingItemIndex,
          deletedColumns,
        }) => deletedColumns.filter((_, index) => index !== missingItemIndex),
        addedColumns: ({
          newItemIndex,
          addedColumns,
        }) => addedColumns.filter((_, index) => index !== newItemIndex),
      }),

      resolveRemaining: assign({
        created: ({
          addedColumns,
          created,
        }) => [...created, ...addedColumns],
        deleted: ({
          deletedColumns,
          deleted,
        }) => [...deleted, ...deletedColumns],
        deletedColumns: (context) => [],
        addedColumns: (context) => [],
      }),
    },
  }));

export default createResolveColumnsMachine;
