# OpenClaw Fork Workflow

This repository is a maintained fork of `openclaw/openclaw`.

## Remotes

- `upstream` points to the original OpenClaw repository: `https://github.com/openclaw/openclaw.git`
- `origin` points to the maintained fork: `git@github.com:norsyn/openclaw.git`

## Branch roles

- `main` mirrors upstream OpenClaw and should remain a clean upstream-tracking branch.
- `jo/stable` is the long-lived customization branch and is the correct branch for ongoing Jo/OpenClaw development.
- `jo/snapshot-pre-fork-setup` is a permanent safety snapshot of the pre-fork dirty state and should remain untouched as a recovery anchor.

## Deployment rule

- Deployments are built from `jo/stable`.
- Do not treat the installed runtime under `/opt/homebrew/lib/node_modules/openclaw` as the source of truth.
- Do not patch installed runtime files manually as the normal workflow.

## Safe upstream update workflow

When taking a future upstream OpenClaw update:

1. fetch `upstream`
2. create `jo/integration/upstream-v<version>` from the target upstream tag or branch
3. forward-port the Jo changes onto that integration branch
4. rebuild the runtime
5. validate the rebuilt runtime and behavior
6. merge back into `jo/stable`
7. deploy from `jo/stable` and tag the deployed commit

## Maintenance docs

When answering repository maintenance, deployment, or upstream-sync questions, prefer these documents first:

- `docs/debug/openclaw-custom-patches/FORK_SETUP_PLAN.md`
- `docs/debug/openclaw-custom-patches/UPSTREAM_UPDATE_WORKFLOW.md`
- `docs/debug/openclaw-custom-patches/DEPLOY_FROM_FORK.md`

Use those documents as the source of truth for fork structure, update workflow, deployment procedure, and safety guidance.
