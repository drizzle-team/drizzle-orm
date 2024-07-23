# Contributing

Welcome! We're glad you're interested in Drizzle ORM and want to help us make it better.

Drizzle ORM is owned by [Drizzle Team](https://drizzle.team) and maintained by community members, mainly by our core contributors [@AndriiSherman](https://github.com/AndriiSherman) [@AlexBlokh](https://github.com/AlexBlokh) [@dankochetov](https://github.com/dankochetov). Everything that is going to be merged should be approved by all core contributors members

---

There are many ways you can contribute to the Drizzle ORM project

- [Submitting bug reports](#bugreport)
- [Submitting feature request](#featurerequest)
- [Providing feedback](#feedback)
- [Contribution guidelines](#contributing)

## <a name="bugreport"></a> Submitting bug report

---

To submit a bug or issue, please use our [issue form](https://github.com/drizzle-team/drizzle-orm/issues/new/choose) and choose Bug Report

## <a name="featurerequest"></a> Submitting feature request

---

To submit a bug or issue, please use our [issue form](https://github.com/drizzle-team/drizzle-orm/issues/new/choose) and choose Feature Request

## <a name="feedback"></a> Providing feedback

---

There are several ways how you can provide a feedback

- You can join our [Discord](https://discord.gg/yfjTbVXMW4) channel and provide feedback there
- You can add new ticket in [Discussions](https://github.com/drizzle-team/drizzle-orm/discussions)
- Mention our [Twitter account](https://twitter.com/DrizzleOrm)

## <a name="contributing"></a> Contribution guidelines

---

- [Pre-Contribution setup](#pre-contribution)
  - [Installing node](#-installing-node)
  - [Install pnpm](#-install-pnpm)
  - [Install docker](#-install-docker)
  - [Clone project](#-clone-project)
  - [Repository Structure](#repo-structure)
  - [Build project](#-build-project)
- [Contributing to `drizzle-orm`](#contributing-orm)
  - [Project structure](#project-structure-orm)
  - [Run tests](#run-tests-orm)
  - [Commits and PRs](#commits-and-prs-orm)
    - [Commit guideline](#commit-guideline-orm)
    - [PR guideline](#pr-guideline-orm)
- [Contributing to `drizzle-kit`](#contributing-kit)
  - [Project structure](#project-structure-kit)
  - [Run tests](#run-tests-kit)
  - [Commits and PRs](#commits-and-prs-kit)
    - [Commit guideline](#commit-guideline-kit)
    - [PR guideline](#-pr-guideline)

## <a name="pre-contribution"></a> Pre-Contribution setup

### <a name="installing-node"></a> Installing node

---

```bash
# https://github.com/nvm-sh/nvm#install--update-script
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.2/install.sh | bash
nvm install 18.13.0
nvm use 18.13.0
```

### <a name="installing-pnpm"></a> Install pnpm

---

```bash
# https://pnpm.io/installation
npm install -g pnpm
```

### <a name="installing-docker"></a> Install docker

---

```bash
# https://docs.docker.com/get-docker/
Use docker guide to install docker on your OS
```

## <a name="local-project-setup"></a> Local project setup

### <a name="clone-project"></a> Clone project

---

```bash
git clone https://github.com/drizzle-team/drizzle-orm.git
cd drizzle-orm
```

### <a name="repo-structure"></a> Repository Structure

```
📂 drizzle-orm/ - orm core package with all main logic for each dialect

📂 drizzle-kit/ - kit core package with all main logic and tests for each dialect

📂 drizzle-typebox/ - all the code related to drizzle+typebox extension

📂 drizzle-valibot/ - all the code related to drizzle+valibot extension

📂 drizzle-zod/ - all the code related to drizzle+zod extension

📂 eslint-plugin-drizzle/ - all the code related to drizzle eslint plugin

📂 changelogs/ - all changelogs for drizzle-orm, drizzle-kit, drizzle-typebox, drizzle-zod, drizzle-valibot modules

📂 examples/ - package with Drizzle ORM usage examples

📂 integration-tests/ - package with all type of tests for each supported database
```

### <a name="build-project"></a> Build project

---

- `"pnpm i && pnpm build"` -> if you run this script from root folder - it will build whole monorepo. Running this script from specific package folder will only build current package

## <a name="contributing-orm"></a> Contributing to `drizzle-orm`

### <a name="project-structure-orm"></a> Project structure

```
Project sctructure

📂 pg-core, mysql-core, sqlite-core - core packages for each dialect with all the main logic for relation and query builder

📂 sql/ - package containing all expressions and SQL template implementation

All other folders are for specific drivers that Drizzle ORM supports.
```

### <a name="run-tests-orm"></a> Run tests

---
All tests for Drizzle ORM are integration tests, that are simulating real database and different queries and responses from database. Each file in `integration-tests` has a list of different scenarios for different dialect+driver. Each file is creating a docker instance with needed database and running test cases there. Right after all tests were run - docker container with database will be deleted

If you have added additional logic to core package - make sure that all tests were executed without any errors

> If you have added data types or feature for query building, you need to create additional test cases with this data type/syntax changes, syntax addition

- `"cd integration-tests && pnpm test"` -> will run all tests in integration test folder

## <a name="commits-and-prs-orm"></a> Commits and PRs

### <a name="commit-guideline-orm"></a> Commit guideline

---

We have specific rules on how commit messages should be structured.

It's important to make sure your commit messages are clear, concise, and informative to make it easier for others to understand the changes you are making

Commit message pattern

```
<subject>
<BLANK LINE>
<body>
```

Example

```
Add groupBy error message

In specific case, groupBy was responding with unreadable error
...
```

> **Warning**:
> All commits should be signed, before submitting PR. Please check detailed info on [how to sign commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)

### <a name="pr-guideline-orm"></a> PR guideline

---

1. PR should be created with specific name pattern

```
[Dialect name]: <subject>
```

Example

```
[Pg] Add PostGIS extension support
```

2. PR should contain detailed description with everything, that was changed

3. Each PR should contain
    - Tests on feature, that was created;
    - Tests on bugs, that was fixed;

To understand how test should be created and run - please check [Run tests](#-run-tests) section


## <a name="contributing-kit"></a> Contributing to `drizzle-kit`

### <a name="project-structure-kit"></a> Project structure

```
📂 cli/
 |
 | -> 📄 schema.ts - all the commands defined using brocli
 |
 | -> 📂 commands - all the business logic for drizzle-kit commands

📂 extensions/ - all the extension helpers for databases

📂 serialaizer/ - all the necessary logic to read from the Drizzle ORM schema and convert it to a common JSON format, as well as the logic to introspect all tables, types, and other database elements and convert them to a common JSON format

📄 introspect-pg.ts, introspect-mysql.ts, introspect-sqlite.ts - these files are responsible for mapping JSON snapshots to TypeScript files during introspect commands

📄 snapshotsDiffer.ts - this file handles the mapping from JSON snapshot format to JSON statement objects.

📄 jsonStatements.ts - this file defines JSON statement types, interfaces, and helper functions.

📄 sqlgenerator.ts - this file converts JSON statements to SQL strings.
```

### <a name="run-tests-kit"></a> Run tests

---
All tests for Drizzle Kit are integration tests, that are simulating real database and different queries and responses from database. Each file in `drizzle-kit/tests` has a list of different scenarios for different commands. Each MySQL file is creating a docker instance with needed database and running test cases there. Right after all tests were run - docker container with database will be deleted. For PostgreSQL we are using PgLite and for SQLite we are using SQLite files.

If you are in the root of repo:

- `"cd drizzle-kit && pnpm test"` -> will run all tests

## <a name="commits-and-prs-kit"></a> Commits and PRs

### <a name="commit-guideline-kit"></a> Commit guideline

---

We have specific rules on how commit messages should be structured.

It's important to make sure your commit messages are clear, concise, and informative to make it easier for others to understand the changes you are making

Commit message pattern

```
<subject>
<BLANK LINE>
<body>
```

Example

```
Add groupBy error message

In specific case, groupBy was responding with unreadable error
...
```

> **Warning**:
> All commits should be signed, before submitting PR. Please check detailed info on [how to sign commits](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)

### <a name="pr-guideline-kit"></a> PR guideline

---

1. PR should be created with specific name pattern

```
[<Dialect name>-kit]: <subject>
```

Example

```
[Pg-kit] Add PostGIS extension support
```

2. PR should contain detailed description with everything, that was changed

3. Each PR should contain
    - Tests on feature, that was created;
    - Tests on bugs, that was fixed;

To understand how test should be created and run - please check [Run tests](#run-tests) section
