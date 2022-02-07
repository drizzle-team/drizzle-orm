import createResolveTablesMachine from '../cli/machines/resolveTablesMachine';
import { log } from "console";

import { interpret } from 'xstate';

test('Dry run, empty data', (done) => {
  const resolveTablesMachine = createResolveTablesMachine({ missingTables: [], newTables: [] });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      createdTables,
      renamedTables,
      deletedTables,
    } = state.context;

    if (state.matches('done')) {
      expect({
        created: createdTables,
        renamed: renamedTables,
        deleted: deletedTables,
      }).toStrictEqual({
        created: [],
        renamed: [],
        deleted: [],
      });

      service.stop();
      done()
    }
  });
});

test('Dry run, empty missing', (done) => {
  const resolveTablesMachine = createResolveTablesMachine({ missingTables: [], newTables: [{ name: 'new1' }, { name: 'new2' }] });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      createdTables,
      renamedTables,
      deletedTables,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created: createdTables,
        renamed: renamedTables,
        deleted: deletedTables,
      }).toStrictEqual({
        created: [{ name: 'new1' }, { name: 'new2' }],
        renamed: [],
        deleted: [],
      });

      service.stop();
      done()
    }
  });
});

test('Rename 1 table', (done) => {
  const machine = createResolveTablesMachine({
    missingTables: [
      { name: 'from' },
    ],
    newTables: [
      { name: 'to' },
    ]
  });

  const service = interpret(machine).start();
  service.subscribe((state) => {
    const {
      createdTables,
      renamedTables,
      deletedTables,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created: createdTables,
        renamed: renamedTables,
        deleted: deletedTables,
      }).toStrictEqual({
        created: [],
        renamed: [
          { from: { name: 'from' }, to: { name: 'to' } },
        ],
        deleted: []
      });

      service.stop();
      done()
    }
  });

  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'RENAMED' });
  service.send({ type: 'CHOICE_NEW_ITEM', itemIndex: 0 });
  service.send({ type: 'CONFIRM' });
});

test('Dry run, empty new', (done) => {
  const resolveTablesMachine = createResolveTablesMachine({ missingTables: [{ name: 'missing1' }, { name: 'missing2' }], newTables: [] });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      createdTables,
      renamedTables,
      deletedTables,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created: createdTables,
        renamed: renamedTables,
        deleted: deletedTables,
      }).toStrictEqual({
        created: [],
        renamed: [],
        deleted: [{ name: 'missing1' }, { name: 'missing2' }],
      });

      service.stop();
      done()
    }
  });
});

test('Delete 2 tables and resolve remaining new tables', (done) => {
  const resolveTablesMachine = createResolveTablesMachine({
    missingTables: [
      { name: 'missing1' },
      { name: 'missing2' }
    ],
    newTables: [{ name: 'new1' }, { name: 'new2' }]
  });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      createdTables,
      renamedTables,
      deletedTables,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created: createdTables,
        renamed: renamedTables,
        deleted: deletedTables,
      }).toStrictEqual({
        created: [{ name: 'new1' }, { name: 'new2' }],
        renamed: [],
        deleted: [{ name: 'missing1' }, { name: 'missing2' }],
      });

      service.stop();
      done()
    }
  });

  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'DELETED' });
  service.send({ type: 'CONFIRM' });
  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'DELETED' });
  service.send({ type: 'CONFIRM' });
});

test('Rename 2 tables and resolve remaining missing tables', (done) => {
  const resolveTablesMachine = createResolveTablesMachine({
    missingTables: [
      { name: 'missing1' },
      { name: 'missing2' },
      { name: 'missing3' },
    ],
    newTables: [
      { name: 'new1' },
      { name: 'new2' }
    ]
  });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      createdTables,
      renamedTables,
      deletedTables,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created: createdTables,
        renamed: renamedTables,
        deleted: deletedTables,
      }).toStrictEqual({
        created: [],
        renamed: [
          { from: { name: 'missing1' }, to: { name: 'new1' } },
          { from: { name: 'missing2' }, to: { name: 'new2' } }
        ],
        deleted: [{ name: 'missing3' }]
      });

      service.stop();
      done()
    }
  });

  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'RENAMED' });
  service.send({ type: 'CHOICE_NEW_ITEM', itemIndex: 0 });
  service.send({ type: 'CONFIRM' });
  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'RENAMED' });
  service.send({ type: 'CHOICE_NEW_ITEM', itemIndex: 0 });
  service.send({ type: 'CONFIRM' });
});

test('Rename 2 tables and delete 2 tables', (done) => {
  const resolveTablesMachine = createResolveTablesMachine({
    missingTables: [
      { name: 'missing1' },
      { name: 'missing2' },
      { name: 'missing3' },
      { name: 'missing4' },
    ],
    newTables: [
      { name: 'new1' },
      { name: 'new2' }
    ]
  });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      createdTables,
      renamedTables,
      deletedTables,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created: createdTables,
        renamed: renamedTables,
        deleted: deletedTables,
      }).toStrictEqual({
        created: [],
        renamed: [
          { from: { name: 'missing1' }, to: { name: 'new1' } },
          { from: { name: 'missing3' }, to: { name: 'new2' } }
        ],
        deleted: [{ name: 'missing2' }, { name: 'missing4' }]
      });

      service.stop();
      done()
    }
  });

  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'RENAMED' });
  service.send({ type: 'CHOICE_NEW_ITEM', itemIndex: 0 });
  service.send({ type: 'CONFIRM' });
  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'DELETED' });
  service.send({ type: 'CONFIRM' });
  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'RENAMED' });
  service.send({ type: 'CHOICE_NEW_ITEM', itemIndex: 0 });
  service.send({ type: 'CONFIRM' });
  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'DELETED' });
  service.send({ type: 'CONFIRM' });
});

test('Delete 2 tables, rename 2 tables and resolve remaining missing', (done) => {
  const resolveTablesMachine = createResolveTablesMachine({
    missingTables: [
      { name: 'missing1' },
      { name: 'missing2' },
      { name: 'missing3' },
      { name: 'missing4' },
      { name: 'missing5' },
      { name: 'missing6' },
    ],
    newTables: [
      { name: 'new1' },
      { name: 'new2' },
    ]
  });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      createdTables,
      renamedTables,
      deletedTables,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created: createdTables,
        renamed: renamedTables,
        deleted: deletedTables,
      }).toStrictEqual({
        created: [],
        renamed: [
          { from: { name: 'missing2' }, to: { name: 'new1' } },
          { from: { name: 'missing4' }, to: { name: 'new2' } }
        ],
        deleted: [{ name: 'missing1' }, { name: 'missing3' }, { name: 'missing5' }, { name: 'missing6' }]
      });

      service.stop();
      done()
    }
  });

  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'DELETED' });
  service.send({ type: 'CONFIRM' });
  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'RENAMED' });
  service.send({ type: 'CHOICE_NEW_ITEM', itemIndex: 0 });
  service.send({ type: 'CONFIRM' });
  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'DELETED' });
  service.send({ type: 'CONFIRM' });
  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'RENAMED' });
  service.send({ type: 'CHOICE_NEW_ITEM', itemIndex: 0 });
  service.send({ type: 'CONFIRM' });
});

export { };