# Tag-based publishing

We publish pi packages by pushing git tags of the form `@glemsom/<pkg>@<version>`. CI matches the tag, extracts the package name, writes the version into `package.json`, and runs `npm publish -w packages/<pkg>`.

**Why not changesets?** Changesets would give us automated changelogs and version bumps, but for a handful of independently small packages the overhead — bot setup, PR workflow, `.changeset/` directory — outweighs the benefit. Tags are a single `git tag && git push` with no bot dependency.

**Why not manual workflow dispatch?** Manual dispatch (typing a package name into a GitHub Actions form) is error-prone and gives no audit trail. Tags are immutable and self-documenting.

**Why not publish every package on every push to main?** We want independent versioning. A change to `pi-theme-glemsom` should not force a bump on `pi-profile`.

## Considered Options

- **Changesets**: Too much infrastructure for a small monorepo. Revisit if the number of packages grows beyond ~10.
- **Manual workflow dispatch**: Rejected for auditability.
- **Push-to-main publishes all**: Rejected — no independent versioning.
