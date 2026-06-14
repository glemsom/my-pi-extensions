# pi-my-look

Modern UI polish for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent).

- 🎨 Branded splash on session start (typewriter reveal + fade-out)
- Clean flat tool call lines starting with a status dot `●` (green for success, red for error, yellow for executing/partial) instead of default boxed backgrounds
- Capitalized tool names with arguments in parentheses (e.g., `Edit(/path/to/file)` or `Bash(command)`)
- Execution results hidden by default when collapsed with a `(ctrl+o to expand)` hint, and fully visible (preview/stats) when expanded

## Install

```bash
pi install npm:@glemsom/pi-my-look
```

## Customize

Edit the `TAGLINE`, `SPLASH_COLORS`, and `BOX_WIDTH` constants at the top of the extension file. For npm installs you can override with a local copy or a fork.

## License

MIT
