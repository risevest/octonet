# Test builds

Releases go to npm as `@risemaxi/octonet` through `.github/workflows/deploy.yml`. To try an unreleased branch in a service first, publish a private test build to GitHub Packages.

## Publish

Push the commit to a branch under `rc/`:

```bash
git push origin HEAD:rc/<topic>
```

`.github/workflows/publish-rc.yml` builds it and publishes `@risevest/octonet@<next patch>-rc.<run number>` with the `rc` tag. The run's summary shows the exact version.

## Install in a service

Map the `@risevest` scope to GitHub Packages in the service's `.npmrc`:

```
@risevest:registry=https://npm.pkg.github.com
```

Then install the build under the usual name, so imports (including `@risemaxi/octonet/dist/...`) don't change:

```bash
yarn add @risemaxi/octonet@npm:@risevest/octonet@<version>
```

Installing needs a GitHub token with `read:packages`:

- **Locally:** add `//npm.pkg.github.com/:_authToken=<token>` to `~/.npmrc`.
- **In CI and Docker builds:** follow rise-transactions (`.github/workflows/build-test.yml`, `Dockerfile`, `deploy.sh`). The package must grant the service's repository read access in its GitHub package settings for `GITHUB_TOKEN` to work.

Before merging the service to `master`, release the version to npm and switch back to `@risemaxi/octonet@^<version>`.
