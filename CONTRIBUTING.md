# Contributing

Welcome! We're glad you're interested in Drizzle ORM and want to help us make it better.

Drizzle ORM is owned by [Drizzle Team](https://drizzle.team) and maintained by community members, mainly by our core contributors ([@AndriiSherman](https://github.com/AndriiSherman), [@AlexBlokh](https://github.com/AlexBlokh), [@dankochetov](https://github.com/dankochetov)). Everything that is going to be merged should be approved by all core contributors members.

---

There are many ways you can contribute to the Drizzle ORM project:

- [Submitting bug reports](#bug-report)
- [Submitting feature request](#feature-request)
- [Providing feedback](#feedback)
- [Contribution guidelines](#contribution-guidelines)

## <a name="bug-report"></a> Submitting bug report

To report a bug or issue, please use our [issue form](https://github.com/drizzle-team/drizzle-orm/issues/new/choose) and choose Bug Report.

## <a name="feature-request"></a> Submitting feature request

To request a feature, please use our [issue form](https://github.com/drizzle-team/drizzle-orm/issues/new/choose) and choose Feature Request.

## <a name="feedback"></a> Providing feedback

There are several ways you can provide feedback:

- You can join our [Discord server](https://discord.gg/yfjTbVXMW4) and provide feedback there.
- You can add new ticket in [Discussions](https://github.com/drizzle-team/drizzle-orm/discussions).
- Mention our [Twitter account](https://twitter.com/DrizzleOrm).

## <a name="contribution-guidelines"></a> Contribution guidelines

- [Pre-contribution setup](#pre-contribution)
  - [Installing Node](#installing-node)
  - [Installing pnpm](#installing-pnpm)
  - [Installing Docker](#installing-docker)
  - [Cloning the repository](#cloning-the-repository)
  - [Repository structure](#repository-structure)
  - [Building the project](#building-the-project)
- [Commit message guidelines](#commit-message-guidelines)
- [Contributing to `drizzle-orm`](#contributing-orm)
  - [Project structure](#project-structure-orm)
  - [Running tests](#running-tests-orm)
  - [PR guidelines](#pr-guidelines-orm)
- [Contributing to `drizzle-kit`](#contributing-kit)
  - [Project structure](#project-structure-kit)
  - [Running tests](#running-tests-kit)
  - [PR guidelines](#pr-guidelines-kit)

## <a name="pre-contribution"></a> Pre-contribution setup

### <a name="installing-node"></a> Installing Node

```bash
# https://github.com/nvm-sh/nvm#install--update-script
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 18.13.0
nvm use 18.13.0
```

### <a name="installing-pnpm"></a> Installing pnpm

```bash
# https://pnpm.io/installation
npm install -g pnpm
```

### <a name="installing-docker"></a> Installing Docker

```bash
# https://docs.docker.com/get-docker/
# Use Docker's guide to install Docker for your OS.
```

### <a name="cloning-the-repository"></a> Cloning the repository

```bash
git clone https://github.com/drizzle-team/drizzle-orm.git
cd drizzle-orm
```

### <a name="repository-structure"></a> Repository structure

- 📂 `drizzle-orm/`

  orm core package with all main logic for each dialect

- 📂 `drizzle-kit/`

  kit core package with all main logic and tests for each dialect

- 📂 `drizzle-typebox/`

  all the code related to drizzle+typebox extension

- 📂 `drizzle-valibot/`

  all the code related to drizzle+valibot extension

- 📂 `drizzle-zod/`

  all the code related to drizzle+zod extension

- 📂 `eslint-plugin-drizzle/`

  all the code related to drizzle eslint plugin

- 📂 `changelogs/`

  all changelogs for drizzle-orm, drizzle-kit, drizzle-typebox, drizzle-zod, drizzle-valibot modules

- 📂 `examples/`

  package with Drizzle ORM usage examples

- 📂 `integration-tests/`

  package with all type of tests for each supported database

### <a name="building-the-project"></a> Building the project

Run the following script from the root folder to build the whole monorepo. Running it from a specific package folder will only build that package.

```bash
pnpm install && pnpm build
```

## <a name="commit-message-guidelines"></a> Commit message guidelines

We have specific rules on how commit messages should be structured.

It's important to make sure your commit messages are clear, concise, and informative to make it easier for others to understand the changes you are making.

All commit messages should follow the pattern below:

```
<subject>
<BLANK LINE>
<body>
```

Example:

```
Add groupBy error message

In specific case, groupBy was responding with unreadable error
...
```

> [!WARNING]
> All commits should be signed before submitting a PR. Please check the documentation on [how to sign commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification).

## <a name="contributing-orm"></a> Contributing to `drizzle-orm`

### <a name="project-structure-orm"></a> Project structure

- 📂 `pg-core/`, `mysql-core/`, `sqlite-core/`
  
  core packages for each dialect with all the main logic for relation and query builder

- 📂 `sql/`

  package containing all expressions and SQL template implementation

- All other folders are for each specific driver that Drizzle ORM supports.

### <a name="running-tests-orm"></a> Running tests

All tests for Drizzle ORM are integration tests that simulate real databases with different queries and responses from each database. Each file in `integration-tests` has a list of different scenarios for different dialects and drivers. Each file creates a Docker container with the needed database and runs the test cases there. After every test is run, the Docker container will be deleted.

If you have added additional logic to a core package, make sure that all tests completed without any failures.

> [!NOTE]
> If you have added data types or a feature for query building, you need to create additional test cases using the new API to ensure it works properly.

If you are in the root of the repository, run all integration tests with the following script:

```bash
cd integration-tests && pnpm test
```

### <a name="pr-guidelines-orm"></a> PR guidelines

1. PR titles should follow the pattern below:

   ```
   [<dialect name>]: <subject>
   ```

   Example:

   ```
   [Pg] Add PostGIS extension support
   ```

2. PRs should contain a detailed description of everything that was changed.

3. Commit messages should follow the [message style guidelines](#commit-message-guidelines).

4. PRs should implement:
   - Tests for features that were added.
   - Tests for bugs that were fixed.

> [!NOTE]
> To understand how tests should be created and run, please check the [Running tests](#running-tests-orm) section.

## <a name="contributing-kit"></a> Contributing to `drizzle-kit`

### <a name="project-structure-kit"></a> Project structure

- 📂 `cli/`
  - 📄 `schema.ts`

    all the commands defined using brocli

  - 📂 `commands/`

    all the business logic for drizzle-kit commands

- 📂 `extensions/`

  all the extension helpers for databases

- 📂 `serializer/`

  all the necessary logic to read from the Drizzle ORM schema and convert it to a common JSON format, as well as the logic to introspect all tables, types, and other database elements and convert them to a common JSON format

- 📄 `introspect-pg.ts`, `introspect-mysql.ts`, `introspect-sqlite.ts`

  these files are responsible for mapping JSON snapshots to TypeScript files during introspect commands

- 📄 `snapshotsDiffer.ts`

  this file handles the mapping from JSON snapshot format to JSON statement objects.

- 📄 `jsonStatements.ts`

  this file defines JSON statement types, interfaces, and helper functions.

- 📄 `sqlgenerator.ts`

  this file converts JSON statements to SQL strings.

### <a name="running-tests-kit"></a> Running tests

All tests for Drizzle Kit are integration tests that simulate real databases with different queries and responses from each database. Each file in `drizzle-kit/tests` has a list of different scenarios for different commands. Each file creates a Docker container with the needed database and runs the test cases there. After every test is run, the Docker container will be deleted. We test MySQL, PostgreSQL (using PGlite), and SQLite.

If you are in the root of the repository, run all Drizzle Kit tests with the following script:

```bash
cd drizzle-kit && pnpm test
```

### <a name="pr-guidelines-kit"></a> PR guidelines

1. PR titles should follow the pattern below:

   ```
   [<dialect name>-kit]: <subject>
   ```

   Example:

   ```
   [Pg-kit] Add PostGIS extension support
   ```

2. PRs should contain a detailed description of everything that was changed.

3. Commit messages should follow the [message style guidelines](#commit-message-guidelines).

4. PRs should implement:
   - Tests for features that were added.
   - Tests for bugs that were fixed.

> [!NOTE]
> To understand how tests should be created and run, please check the [Running tests](#running-tests-kit) section.
