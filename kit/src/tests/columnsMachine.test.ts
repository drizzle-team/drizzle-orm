import createResolveColumnsMachine from '../cli/machines/resolveColumnsMachine';
import { interpret } from 'xstate';
import { log } from "console";


test('Dry run, empty data', () => {
  const resolveTablesMachine = createResolveColumnsMachine({ name: 'Test', deleted: [], added: [] });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      created,
      renamed,
      deleted,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created,
        renamed,
        deleted,
      }).toStrictEqual({
        created: [],
        renamed: [],
        deleted: [],
      });

      service.stop();
    }
  });
});

test('Dry run, empty missing', () => {
  const resolveTablesMachine = createResolveColumnsMachine({ name: 'Test', deleted: [], added: [{ name: 'new1' }, { name: 'new2' }] });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      created,
      renamed,
      deleted,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created,
        renamed,
        deleted,
      }).toStrictEqual({
        created: [{ name: 'new1' }, { name: 'new2' }],
        renamed: [],
        deleted: [],
      });

      service.stop();
    }
  });
});

test('Dry run, empty new', () => {
  const resolveTablesMachine = createResolveColumnsMachine({ name: 'Test', deleted: [{ name: 'missing1' }, { name: 'missing2' }], added: [] });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      created,
      renamed,
      deleted,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created,
        renamed,
        deleted,
      }).toStrictEqual({
        created: [],
        renamed: [],
        deleted: [{ name: 'missing1' }, { name: 'missing2' }],
      });

      service.stop();
    }
  });
});

test('Delete 2 columns and resolve remaining new columns', () => {
  const resolveTablesMachine = createResolveColumnsMachine({
    name: 'Test',
    deleted: [
      { name: 'missing1' },
      { name: 'missing2' }
    ],
    added: [{ name: 'new1' }, { name: 'new2' }]
  });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      created,
      renamed,
      deleted,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created,
        renamed,
        deleted,
      }).toStrictEqual({
        created: [{ name: 'new1' }, { name: 'new2' }],
        renamed: [],
        deleted: [{ name: 'missing1' }, { name: 'missing2' }],
      });

      service.stop();
    }
  });

  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'DELETED' });
  service.send({ type: 'CONFIRM' });
  service.send({ type: 'CHOICE_ITEM', itemIndex: 0 });
  service.send({ type: 'DELETED' });
  service.send({ type: 'CONFIRM' });
});

test('Rename 1 column', (done) => {
  const machine = createResolveColumnsMachine({
    name: 'Table',
    deleted: [
      { name: 'from' },
    ],
    added: [
      { name: 'to' },
    ]
  });

  const service = interpret(machine).start();

  service.subscribe((state) => {
    const {
      created,
      renamed,
      deleted,
    } = state.context;
    
    if (state.changed && state.matches('done')) {
      expect({
        created,
        renamed,
        deleted,
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

test('Rename 2 columns and resolve remaining missing columns', () => {
  const resolveTablesMachine = createResolveColumnsMachine({
    name: 'Test',
    deleted: [
      { name: 'missing1' },
      { name: 'missing2' },
      { name: 'missing3' },
    ],
    added: [
      { name: 'new1' },
      { name: 'new2' }
    ]
  });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      created,
      renamed,
      deleted,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created,
        renamed,
        deleted,
      }).toStrictEqual({
        created: [],
        renamed: [
          { from: { name: 'missing1' }, to: { name: 'new1' } },
          { from: { name: 'missing2' }, to: { name: 'new2' } }
        ],
        deleted: [{ name: 'missing3' }]
      });

      service.stop();
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

test('Rename 2 columns and delete 2 columns', () => {
  const resolveTablesMachine = createResolveColumnsMachine({
    name: 'Test',
    deleted: [
      { name: 'missing1' },
      { name: 'missing2' },
      { name: 'missing3' },
      { name: 'missing4' },
    ],
    added: [
      { name: 'new1' },
      { name: 'new2' },
    ]
  });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      created,
      renamed,
      deleted,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created,
        renamed,
        deleted
      }).toStrictEqual({
        created: [],
        renamed: [
          { from: { name: 'missing1' }, to: { name: 'new1' } },
          { from: { name: 'missing3' }, to: { name: 'new2' } }
        ],
        deleted: [{ name: 'missing2' }, { name: 'missing4' }]
      });

      service.stop();
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

test('Delete 2 columns, rename 2 columns and resolve remaining missing', () => {
  const resolveTablesMachine = createResolveColumnsMachine({
    name: 'Test',
    deleted: [
      { name: 'missing1' },
      { name: 'missing2' },
      { name: 'missing3' },
      { name: 'missing4' },
      { name: 'missing5' },
      { name: 'missing6' },
    ],
    added: [
      { name: 'new1' },
      { name: 'new2' },
    ]
  });
  const service = interpret(resolveTablesMachine).start();

  service.subscribe((state) => {
    const {
      created,
      renamed,
      deleted,
    } = state.context;

    if (state.changed && state.matches('done')) {
      expect({
        created,
        renamed,
        deleted,
      }).toStrictEqual({
        created: [],
        renamed: [
          { from: { name: 'missing2' }, to: { name: 'new1' } },
          { from: { name: 'missing4' }, to: { name: 'new2' } }
        ],
        deleted: [{ name: 'missing1' }, { name: 'missing3' }, { name: 'missing5' }, { name: 'missing6' }]
      });

      service.stop();
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
