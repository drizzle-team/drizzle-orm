# Release flow

- Push feature branch
- Bump package versions manually
- Create PR to main
- TODO: GitHub Actions checks if changelog is present for every package version
- Resolve all conflicts, bump versions if necessary
- Merge PR
- GitHub Action publishes new versions to NPM
