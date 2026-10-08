import fs from 'fs';
import { drop } from 'src/cli/schema';
import { afterEach, beforeEach, expect, test } from 'vitest';

beforeEach(async () => {
	// create fs structure
	fs.mkdirSync(`${__dirname}/meta`);
	fs.writeFileSync(`${__dirname}/meta/_journal.json`, journal);
	fs.writeFileSync(`${__dirname}/meta/0000_snapshot.json`, snapshot0);
	fs.writeFileSync(`${__dirname}/meta/0001_snapshot.json`, snapshot1);
	fs.writeFileSync(`${__dirname}/0000_little_blizzard.sql`, sql0);
	fs.writeFileSync(`${__dirname}/0001_nebulous_storm.sql`, sql1);
});

afterEach(async () => {
	// delete the fs structure
	fs.rmdirSync(`${__dirname}/meta`, { recursive: true });
	fs.rmSync(`${__dirname}/0000_little_blizzard.sql`);
});

test('validate drop function', async () => {
	await drop.handler?.({
		name: '0001_nebulous_storm',
		bundle: false,
		out: `${__dirname}`,
	});

	const journal = JSON.parse(fs.readFileSync(`${__dirname}/meta/_journal.json`, 'utf-8'));
	expect(journal.entries).toHaveLength(1);
	expect(journal.entries[0].tag).toBe('0000_little_blizzard');

	// read in the current files in dir
	const files = fs.readdirSync(`${__dirname}`);
	const sqlFiles = files.filter((file) => file.endsWith('.sql'));
	expect(sqlFiles).toHaveLength(1);
});

const journal = `{
  "version": "7",
  "dialect": "sqlite",
  "entries": [
    {
      "idx": 0,
      "version": "6",
      "when": 1725358702427,
      "tag": "0000_little_blizzard",
      "breakpoints": true
    },
    {
      "idx": 1,
      "version": "6",
      "when": 1725358713033,
      "tag": "0001_nebulous_storm",
      "breakpoints": true
    }
  ]
}`;

const snapshot0 = `{
    "version": "6",
    "dialect": "sqlite",
    "id": "2bd46776-9e41-4a6c-b617-5c600bb176f2",
    "prevId": "00000000-0000-0000-0000-000000000000",
    "tables": {
      "users": {
        "name": "users",
        "columns": {
          "id": {
            "name": "id",
            "type": "integer",
            "primaryKey": true,
            "notNull": true,
            "autoincrement": false
          },
          "name": {
            "name": "name",
            "type": "text",
            "primaryKey": false,
            "notNull": true,
            "autoincrement": false
          }
        },
        "indexes": {},
        "foreignKeys": {},
        "compositePrimaryKeys": {},
        "uniqueConstraints": {}
      }
    },
    "enums": {},
    "_meta": {
      "schemas": {},
      "tables": {},
      "columns": {}
    },
    "internal": {
      "indexes": {}
    }
  }`;

const snapshot1 = `{
  "version": "6",
  "dialect": "sqlite",
  "id": "6c0ec455-42fd-47fd-a22c-4bb4551e1358",
  "prevId": "2bd46776-9e41-4a6c-b617-5c600bb176f2",
  "tables": {
    "users": {
      "name": "users",
      "columns": {
        "id": {
          "name": "id",
          "type": "integer",
          "primaryKey": false,
          "notNull": false,
          "autoincrement": false
        },
        "name": {
          "name": "name",
          "type": "integer",
          "primaryKey": false,
          "notNull": true,
          "autoincrement": false
        }
      },
      "indexes": {},
      "foreignKeys": {},
      "compositePrimaryKeys": {},
      "uniqueConstraints": {}
    }
  },
  "enums": {},
  "_meta": {
    "schemas": {},
    "tables": {},
    "columns": {}
  },
  "internal": {
    "indexes": {}
  }
}`;

const sql0 = `CREATE TABLE \`users\` (
	\`id\` integer PRIMARY KEY NOT NULL,
	\`name\` text NOT NULL
);
`;

const sql1 = `PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE \`__new_users\` (
	\`id\` integer,
	\`name\` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO \`__new_users\`("id", "name") SELECT "id", "name" FROM \`users\`;--> statement-breakpoint
DROP TABLE \`users\`;--> statement-breakpoint
ALTER TABLE \`__new_users\` RENAME TO \`users\`;--> statement-breakpoint
PRAGMA foreign_keys=ON;`;
