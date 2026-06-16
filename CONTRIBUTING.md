# Contributing

Thanks for helping improve Azoth.

## Development setup

Requirements:

- Node.js 20 or newer
- pnpm 10

Install dependencies and run the core checks:

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Run the CLI locally with:

```sh
pnpm azoth
```

## Desktop UI design

Desktop renderer features should follow the shared design-system note in
[docs/desktop-design-system.md](docs/desktop-design-system.md). Prefer the
tokens and primitives in `desktop/src/renderer/styles/globals.css` over one-off
utility class styling in JSX.

## Pull requests

- Keep changes focused and describe the behavior change clearly.
- Add or update tests when changing runtime behavior.
- Run `pnpm typecheck`, `pnpm test`, and `pnpm build` before requesting review.
- Do not commit generated `dist/` output.

## Changesets and releases

Azoth uses Changesets for versioning, changelog generation, and npm publishing.

For user-facing changes, run:

```sh
pnpm changeset
```

Choose the appropriate semver impact and write a short release note. Documentation-only, test-only, or internal maintenance changes may skip a changeset when they do not affect users.

After changes land on `master`, the release workflow opens or updates a release pull request. Merging that release pull request publishes the package to npm and creates a GitHub release.
