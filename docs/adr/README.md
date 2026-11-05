# Decision records

The architecture decision records of this repository live in [drizzle-team/drizzle-decisions](https://github.com/drizzle-team/drizzle-decisions). That repository has one folder for each part of this one: `drizzle-orm`, `drizzle-kit` and `postgres`.

## Read the records

Clone the repository into a temporary directory, then search it:

```bash
git clone --depth 1 https://github.com/drizzle-team/drizzle-decisions /tmp/drizzle-decisions
```

Read the records of a package before you change its design. If a change contradicts a record, say so and name the record by its folder and number, for example `drizzle-kit/0005`.

## Add a record

Follow the steps in the README of drizzle-decisions, and open a pull request there. The pull request in this repository that implements the decision links to the record.
