import { interpret } from 'xstate';

import createResolveTablesMachine, { CreateTablesMachineProps } from '../machines/resolveTablesMachine';
import createResolveColumnsMachine, { CreateColumnsMachineProps } from '../machines/resolveColumnsMachine';
import formatDataForTable from '../utils/formatDataForTable';

const loading = require('loading-cli');
const { Select, Confirm } = require('enquirer');
const Table = require('cli-table');

export interface CallbackProps {
  setTitle: (title: string) => void;
  setError: (error: any) => void;
}

export interface Named {
  name: string
}

export interface RenamedObject<T> {
  from: T,
  to: T
}

interface TablesResultData<T extends Named> {
  created: T[],
  renamed: RenamedObject<T>[],
  deleted: T[],
}

interface ColumnsResultData<T extends Named> {
  created: T[],
  renamed: RenamedObject<T>[],
  deleted: T[],
}

const actions = ['Renamed', 'Deleted'];

const bold = '\x1b[1m';
const red = '\u001B[31m';
const blue = '\u001B[34m';
const reset = '\u001B[0m';

const getElementIndexByName = (
  array: Named[],
  elementName: string,
) => array.findIndex(({ name }) => name === elementName);

const clearLine = () => {
  process.stdout.moveCursor(0, -1);
  process.stdout.clearLine(1);
}

export const task = async <T extends unknown>(
  titleStr: string,
  func: (props: CallbackProps) => T,
): Promise<T> => {
  const progress = loading({
    frames: ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'],
    text: `${bold}${titleStr}`,

  }).start();
  try {
    const result = await func({
      setTitle: (title: string) => { progress.text = `${bold}${title}`; },
      setError: (error: any) => { progress.fail(error.message); },
    });
    progress.succeed();
    return result;
  } catch (error: any) {
    progress.fail(`${bold}${error.message}`);
    throw Error(error);
  }
};

export const promptTablesConflicts = <T extends Named>(
  { missingTables: m, newTables: n }: CreateTablesMachineProps<T>,
) => new Promise<TablesResultData<T>>((
    resolve,
  ) => {
    const resolveTablesMachine = createResolveTablesMachine({ missingTables: m, newTables: n });
    const service = interpret(resolveTablesMachine).start();
    service.subscribe(async (state) => {
      try {
        const {
          missingItemIndex,
          newItemIndex,
          newTables,
          missingTables,
          createdTables,
          renamedTables,
          deletedTables,
        } = state.context;

        if (state.matches('idle')) {
          service.send({ type: 'NEXT' });
        }

        if (state.changed && state.matches('table')) {
          const tableName = await new Select({
            name: 'tableName',
            message: 'Chose missing table:',
            choices: missingTables.map(({ name }) => name),
          }).run();
          clearLine();
          service.send({ type: 'CHOICE_ITEM', itemIndex: getElementIndexByName(missingTables, tableName) });
        }

        if (state.changed && state.matches('action.actionChoice')) {
          const actionName = await new Select({
            name: 'tableName',
            message: `Table "${missingTables[missingItemIndex].name}" was:`,
            choices: actions,
          }).run();
          clearLine();
          service.send({ type: actionName.toUpperCase() });
        }

        if (state.changed && state.matches('confirmationDelete')) {
          const confirmation = await new Confirm({
            name: 'confirm',
            message: 'Are you sure?',
            initial: true,
          }).run();
          clearLine();

          if (confirmation) console.log(`${bold}Deleted "${missingTables[missingItemIndex].name}" table, ${red}all data will be lost!`)
          service.send({ type: confirmation ? 'CONFIRM' : 'CANCEL' });
        }

        if (state.changed && state.matches('confirmationRename')) {
          const confirmation = await new Confirm({
            name: 'confirm',
            message: 'Are you sure?',
            initial: true,
          }).run();
          clearLine();

          if (confirmation) console.log(`${bold}Renamed "${missingTables[missingItemIndex].name}" -> "${newTables[newItemIndex].name}"`)

          service.send({ type: confirmation ? 'CONFIRM' : 'CANCEL' });
        }

        if (state.changed && state.matches('action.rename')) {
          const tableName = await new Select({
            name: 'tableName',
            message: `Table "${missingTables![missingItemIndex]?.name}" was renamed to:`,
            choices: newTables.map(({ name }) => name),
          }).run();
          clearLine();

          service.send({ type: 'CHOICE_NEW_ITEM', itemIndex: getElementIndexByName(newTables, tableName) });
        }

        if (state.changed && state.matches('done')) {
          if (createdTables.length || deletedTables.length || renamedTables.length) {
            const table = new Table({
              head: [`${blue}Created`, `${blue}Renamed`, `${blue}Deleted`],
              rows: formatDataForTable(createdTables, renamedTables, deletedTables)
            });

            console.log(`${reset}${bold}Tables:`);
            console.log(table.toString());
          }

          resolve({
            created: createdTables,
            deleted: deletedTables,
            renamed: renamedTables,
          });

          service.stop();
        }
      } catch (e) {
        console.error(e);
      }
    });
  });

export const promptColumnsConflicts = <T extends Named>(
  props: CreateColumnsMachineProps<T>,
) => new Promise<ColumnsResultData<T>>((
    resolve,
  ) => {
    const resolveColumnsMachine = createResolveColumnsMachine(props);
    const service = interpret(resolveColumnsMachine).start();

    service.subscribe(async (state) => {
      try {
        const {
          tableName,
          addedColumns,
          deletedColumns,
          missingItemIndex,
          newItemIndex,
          created,
          renamed,
          deleted,
        } = state.context;

        if (state.matches('idle')) {
          service.send({ type: 'NEXT' });
        }

        if (state.changed && state.matches('table')) {
          const columnName = await new Select({
            name: 'columnName',
            message: `Table "${tableName}" missing columns:`,
            choices: deletedColumns.map(({ name }) => name),
          }).run();
          clearLine();

          service.send({ type: 'CHOICE_ITEM', itemIndex: getElementIndexByName(deletedColumns, columnName) });
        }

        if (state.changed && state.matches('action.actionChoice')) {
          const actionName = await new Select({
            name: 'tableName',
            message: `Column "${deletedColumns[missingItemIndex].name}" was:`,
            choices: actions,
          }).run();
          clearLine();

          service.send({ type: actionName.toUpperCase() });
        }

        if (state.changed && state.matches('confirmationDelete')) {
          const confirmation = await new Confirm({
            name: 'confirm',
            message: 'Are you sure?',
            initial: true,
          }).run();
          clearLine();

          if (confirmation) console.log(`${bold}Deleted column "${deletedColumns[missingItemIndex].name}" from "${tableName}" table, ${red}all data will be lost!`)

          service.send({ type: confirmation ? 'CONFIRM' : 'CANCEL' });
        }

        if (state.changed && state.matches('confirmationRename')) {
          const confirmation = await new Confirm({
            name: 'confirm',
            message: 'Are you sure?',
            initial: true,
          }).run();
          clearLine();

          if (confirmation) console.log(`${bold}Renamed "${deletedColumns[missingItemIndex].name} -> ${addedColumns[newItemIndex].name}" in "${tableName}" table`)

          service.send({ type: confirmation ? 'CONFIRM' : 'CANCEL' });
        }

        if (state.changed && state.matches('action.rename')) {
          const columnName = await new Select({
            name: 'tableName',
            message: `Column "${deletedColumns![missingItemIndex]?.name}" was renamed to:`,
            choices: addedColumns.map(({ name }) => name),
          }).run();
          clearLine();

          service.send({ type: 'CHOICE_NEW_ITEM', itemIndex: getElementIndexByName(addedColumns, columnName) });
        }

        if (state.changed && state.matches('done')) {
          if (created.length || deleted.length || renamed.length) {
            const table = new Table({
              head: [`${blue}Created`, `${blue}Renamed`, `${blue}Deleted`],
              rows: formatDataForTable(created, renamed, deleted)
            });

            console.log(`${reset}${bold}Table "${tableName}" columns:`);
            console.log(table.toString());
          }

          resolve({
            created,
            deleted,
            renamed,
          });

          service.stop();
        }
      } catch (e) {
        console.error(e);
      }
    });
  });
