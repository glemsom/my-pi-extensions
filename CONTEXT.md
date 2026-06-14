# My Pi Extensions

A monorepo for pi packages (published to npm) and local pi-related tools.

## Language

**Pi package**:
Anything published to npm. Lives in `packages/`. Can be a pi extension, skill bundle, CLI wrapper, theme, or any combination thereof.
_Avoid_: Extension (too narrow — packages can be more than extensions)

**Tool**:
A local script or utility related to pi that is NOT published to npm. Lives in `tools/`. One tool per subdirectory.
_Avoid_: Script, helper

### pi-box (tool: `tools/pi-box/`)

**pi-box**:
The project and the user-facing command that enters the Pi dev environment via devbox.
_Avoid_: pi-in-a-box, pibox

**Base box**:
The machine-wide global devbox configuration (`~/.local/share/devbox/global/default/devbox.json`) that provides `nodejs`, Pi, and default extensions. Managed by `setup.sh` and shared across all projects.
_Avoid_: global config, default box

**Project box**:
A per-repository `devbox.json` that optionally extends the base box with additional project-specific packages. When `pi-box` is run in a directory with a `devbox.json`, it layers on top of the base box.
_Avoid_: local config, repo devbox

**setup.sh**:
The idempotent setup script in `tools/pi-box/`. Edits the global devbox config to declare the base box packages, env vars, and init hooks. Does not install packages — deferred to first run.
_Avoid_: install.sh, bootstrap

**_die**:
Shell function that prints an error message to stderr (prefixed with `Error: `) and returns exit code 1. Used by all failure paths in `pi-box.sh` for consistent, human-readable error output.
_Avoid_: _fail, _fatal, _error_handler

**Pi extension**:
A TypeScript module using `ExtensionAPI` (`@earendil-works/pi-coding-agent`) that registers tools, commands, hooks, etc. A pi extension is one kind of pi package.
_Avoid_: Plugin, addon

## Conventions

- **Naming**: Packages use the `pi-` prefix and are scoped under `@glemsom/`. Example: `@glemsom/pi-git-helper`.
- **Keyword**: All packages include `pi-package` in their npm keywords for gallery discoverability.
- **Granularity**: Each directory in `packages/` is one independently versioned npm package.
- **Package structure**: Convention-based. Pi auto-discovers from `extensions/`, `skills/`, `prompts/`, `themes/` directories. No explicit `pi` manifest in `package.json` unless non-standard paths are needed. CLI tools use standard npm `bin` entries.
- **Publishing**: Tag-based. Pushing a tag of the form `@glemsom/<pkg>@<version>` triggers CI to publish that specific package.
- **Tools**: One tool per subdirectory under `tools/`. Not published to npm.
- **Cross-package dependencies**: Start strictly independent. If shared code is needed later, npm workspaces inter-package deps are available (`@glemsom/pi-shared` with `"*"` version).
- **Root workspace**: npm workspaces at root (`"workspaces": ["packages/*"]`). Development convenience only — each package publishes independently.
- **CI publishing**: On git tag `@glemsom/<pkg>@<version>`, CI writes the tag version into `package.json`, runs `npm publish -w packages/<pkg>`, and creates a GitHub Release. NPM token stored as `NPM_TOKEN` secret in GitHub Actions (repo Settings → Secrets and variables → Actions → Repository secrets).
- **Local dev**: Use `pi -e ./packages/<pkg>/src/index.ts` for extension iteration. Smoke-test the full package load with `pi install ./packages/<pkg>` before publishing.
