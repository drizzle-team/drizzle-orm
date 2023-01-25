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

- You can join our [Discord](https://discord.gg/42E9GSFg) channel and provide feedback there
- You can add new ticket in [Discussions](https://github.com/drizzle-team/drizzle-orm/discussions)
- Mention our [Twitter account](https://twitter.com/DrizzleOrm)

## <a name="contributing"></a> Contribution guidelines
---
- [Contributing](#contributing)
  - [ Submitting bug report](#-submitting-bug-report)
  - [ Submitting feature request](#-submitting-feature-request)
  - [ Providing feedback](#-providing-feedback)
  - [ Contribution guidelines](#-contribution-guidelines)
  - [ General setup](#-general-setup)
    - [ Installing node](#-installing-node)
    - [ Install pnpm](#-install-pnpm)
    - [ Install docker](#-install-docker)
  - [ Local project setup](#-local-project-setup)
    - [ Clone project](#-clone-project)
  - [ Building project](#-building-project)
    - [ Build project](#-build-project)
    - [ Run tests](#-run-tests)
  - [ Commits and PRs](#-commits-and-prs)
    - [ Commit guideline](#-commit-guideline)
    - [ PR guideline](#-pr-guideline)

## <a name="general-setup"></a> General setup
### <a name="installing-node"></a> Installing node
---
```bash
# https://github.com/nvm-sh/nvm#install--update-script
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.2/install.sh | bash
nvm install 17.0.1
nvm use 17.0.1
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

## <a name="building-project"></a> Building project
```
Project sctructure

📂 drizzle-orm/ - core package with common logic

📂 changelogs/ - all changelogs by modules

📂 drizzle-orm/src/pg-core/ - package with all resources for PostgreSQL database support

📂 drizzle-orm/src/sqlite-core/ - package with all resources for SQLite database support

📂 drizzle-orm/src/mysql-core/ - package with all resources for MySQL database support

📂 examples/ - package with Drizzle ORM usage examples

📂 integration-tests/ - package with all type of tests for each supported database

```
### <a name="build-project"></a> Build project
---
- `"pnpm i && pnpm build:int"` -> if you run this script from root folder -  it will build whole monorepo and prepare package.tgz files. Running this script from specific package folder will only build current package

### <a name="run-tests"></a> Run tests
---
- `"cd integration-tests && pnpm test"` -> will run all tests in integration test folder

## <a name="commits-pr"></a> Commits and PRs
### <a name="commit-guideline"></a> Commit guideline
---
We have specific rules on how commit messages should be structured. 

It's important to make sure your commit messages are clear, concise, and informative to make it easier for others to understand the changes you are making

Commit message patten
```
<package name>: <subject>
<BLANK LINE>
<body>
```
Example
```
drizzle-orm: [Pg] Add groupBy error message

In specific case, groupBy was responding with unreadable error
...
```

### <a name="pr-guideline"></a> PR guideline
---
Each PR should be created from a branch, that was named by our pattern
```
<type>/<name>
```
Example
```
feature/groupby
fix/groupby-message-fix
```

List of possible types for branch name
- feature
- fix
- bug
- docs

---
Each PR should contain:
- Tests on feature, that was created 
- Tests on bugs, that was fixed
