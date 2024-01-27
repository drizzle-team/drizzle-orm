// tsx seed.ts

import { faker } from '@faker-js/faker';
import { customAlphabet } from 'nanoid';
import { db } from './db'
import {Users} from './schema'

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';
const length = 14;

const nanoid = customAlphabet(alphabet, length);

const generateUserRows = (count: number): typeof Users.$inferInsert[] => {
  const rows: typeof Users.$inferInsert[] = [];

  for (let i = 0; i < count; i++) {
    rows.push({
      id: nanoid(),
      handle: `${faker.person.firstName()}`,
      email: faker.internet.email(),
      bio: faker.lorem.paragraph(),
      joined: faker.date.anytime()
    });
  }

  return rows;
};

async function seed() {
  console.log('Seeding...');
  console.time('DB has been seeded!');

  // database teardown
  await db.delete(Users);

  // database setup
  const newUserRows = generateUserRows(100000);
  await db.insert(Users).values(newUserRows);
}

seed()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    console.log('Seeding done!');
    process.exit(0);
  });
