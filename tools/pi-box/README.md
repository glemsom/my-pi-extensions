# pi-box

> **Part of [my-pi-extensions](https://github.com/glemsom/my-pi-extensions) monorepo** — `tools/pi-box/`.
> The standalone [pi-box](https://github.com/glemsom/pi-box) repo is archived.

Isolated, reproducible Pi agent environment using [devbox](https://www.jetify.com/devbox). The only host dependency is devbox itself — Pi runs inside the environment, never on the host.

## Prerequisites

- **devbox** must be installed. Follow the [devbox install guide](https://www.jetify.com/devbox/docs/installing_devbox/).
- On **Linux**, Nix must be installed. Multi-user Nix is supported: `/nix` does **not** need to be writable by your user if `nix-daemon` is running.

## Setup

Clone the monorepo and run the setup script from `tools/pi-box/`:

```bash
git clone https://github.com/glemsom/my-pi-extensions.git
cd my-pi-extensions/tools/pi-box
./setup.sh
```

`setup.sh` is idempotent — running it twice is safe. If the base environment is already configured, it prints `nothing to do` and exits. Use `./setup.sh --force` to overwrite an existing config with the canonical pi-box defaults.

After setup, add the `pi-box` command to your shell by adding this to your `~/.bashrc`:

```bash
source /path/to/my-pi-extensions/tools/pi-box/pi-box.sh
```

Then restart your shell or run `source ~/.bashrc`.

## Linux note: multi-user Nix

If `setup.sh` or `pi-box` complains about `/nix` permissions, do **not** `chown` `/nix` in a normal multi-user install. Start `nix-daemon` instead:

```bash
sudo systemctl enable nix-daemon
sudo systemctl start nix-daemon
```

If Nix is not installed yet, install multi-user Nix:

```bash
sh <(curl -L https://nixos.org/nix/install) --daemon
```

## Usage

### Run Pi

The basic invocation passes all arguments directly to Pi:

```bash
pi-box "explain this code"
pi-box --help
pi-box --model gpt-4 "refactor this function"
```

Any flags that `pi-box` doesn't recognize are forwarded to Pi unchanged.

### Interactive shell

Drop into an interactive devbox session (with Pi on PATH):

```bash
pi-box --shell
```

Inside the shell you can run `pi` directly, or use any tools available in the devbox environment.

### Update Pi and extensions

Refresh Pi and its extensions to the latest versions:

```bash
pi-box --update
```

This runs `npm update -g` for Pi and re-installs the context7 extension. Works whether or not a project `devbox.json` is present.

### Project with devbox.json

When you run `pi-box` inside a directory that has its own `devbox.json`, Pi layers on top of your project's tools:

```bash
cd my-python-project  # has devbox.json with python@3
pi-box "explain this algorithm"
```

Your project's devbox packages (e.g. `python@3`) are available alongside Pi, without modifying your project config. The `--shell` flag opens an interactive session with both Pi and your project tools:

```bash
cd my-project
pi-box --shell
```

## How it works

pi-box uses devbox's two-level configuration:

| Layer | Location | Purpose |
|-------|----------|---------|
| **Base box** | `~/.local/share/devbox/global/default/devbox.json` | Provides `nodejs@26`, Pi, and the context7 extension. Configured once by `setup.sh`. |
| **Project box** | `./devbox.json` (per-repo) | Optional. Provides project-specific tools (e.g. `python@3`, `go@1.21`). |

When run without a project `devbox.json`, pi-box activates the base box and runs Pi. When a project `devbox.json` exists, devbox layers the project environment on top of the base box — you get both.

The first invocation after setup installs Pi and extensions automatically via a guarded init hook. Subsequent invocations are instantaneous.

## Pi skills

Pi **skills** (e.g. community or custom skills) are **not** managed by pi-box. They are user-installed separately under `~/.pi/skills`. See the [Pi documentation](https://github.com/earendil-works/pi-coding-agent) for details on installing and managing skills.

## License

MIT
