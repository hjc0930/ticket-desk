# Continuous Integration and Branch Rules

## Develop branch policy

The `develop` branch is the integration branch and accepts ordinary direct
pushes, force pushes, and pull requests. An active GitHub branch ruleset targets only
`refs/heads/develop` and prevents deletion, with no
bypass actors. It does not require pull requests, approvals, status checks, or
up-to-date branches. CI failures provide feedback but do not block merging or
undo commits already pushed. Existing rules for `main` remain unchanged.

## Develop workflow

`.github/workflows/develop-ci.yml` (display name: `Develop CI`) runs on pushes to `develop` and pull requests targeting
`develop`. It also declares `workflow_dispatch`; GitHub exposes manual dispatch
after this workflow exists on the repository's default branch (`main`). Adding
the workflow to `main` is a separate merge, not a default-branch change.

The workflow uses one `quality` job on Ubuntu 24.04, with Node.js 24.21.0 and pnpm
12.6.0 matching the development environment at introduction. Action references
use major-version tags (`@v5`) for readability. The job has a ten-minute timeout and read-only
repository contents permission. Checkout does not persist credentials.

Cache the pnpm store using `pnpm-lock.yaml` and install with
`pnpm install --frozen-lockfile`. Run these checks in order, stopping on failure:

1. `pnpm run format:check`
2. `pnpm run lint`
3. `pnpm run typecheck`
4. `pnpm test`
5. `pnpm run test:e2e`
6. `pnpm run build`
7. `pnpm --filter ticket-desk-webapp run build`

New runs cancel older runs for the same event and PR or branch. Do not filter
paths: documentation and workflow changes must also be checked. Tests use the
existing Vitest setup and test-only configuration; no local `.env`, real secrets,
external database, deployment, migration, or seed operation is required.

## Develop verification

- Run the existing quality commands before publishing the workflow.
- Verify the first GitHub Actions push run completes all seven checks successfully.
- Read back the remote ruleset and confirm its exact branch target, active
  enforcement, empty bypass list, and only the deletion rule.
- Confirm a normal push to `develop` is accepted after the ruleset is enabled.
- Subsequent PRs targeting `develop` must show CI feedback without mandatory
  approval or required-status-check restrictions.

## Main workflow

`.github/workflows/main-ci.yml` (display name: `Main CI`) runs on pushes to
`main`, pull requests targeting `main`, and manual dispatch. Its `main-quality`
job uses the same environment, permissions, timeout, concurrency policy, and
seven checks as the development workflow. No path filters are used.

## Main branch policy

After this workflow is merged through a PR, require `main-quality` from GitHub
Actions in the existing main branch ruleset, preserving all other protections.
The development workflow retains its separate `quality` check name.

## Main verification

Compare the workflow with the development workflow, allowing only its display
name, job identifier, job name, and target branches to differ. Observe the PR and
push check results, then read back the main ruleset to verify `main-quality` is
required from GitHub Actions.

## Historical bootstrap limitation

Main CI was introduced without merging application code from `develop`. At
introduction, `main` lacked `package.json`, `pnpm-lock.yaml`, and application
sources, so its checks were expected to fail until a subsequent PR introduced the
project files. Do not skip checks or weaken their commands to hide such failures.
