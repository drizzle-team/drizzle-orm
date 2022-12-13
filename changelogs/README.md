# Release flow

- Push feature branch
- GitHub workflow publishes new feature tag to NPM
- Bump package versions manually
- (Optional) Create and merge PR to beta
- (Optional) GitHub workflow publishes new beta version to NPM
- Create PR to main
- TODO: GitHub workflow checks if changelog is present for every package version
- Resolve all conflicts, bump versions if necessary
- Merge PR
- GitHub workflow publishes new latest version to NPM and removes feature tag from NPM
