# pi-my-look

Modern UI polish for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent).

- 🎨 Branded splash on session start (typewriter reveal + fade-out)
- 🔍📝✏️⚡ Tool icons inline in chat for read, write, edit, bash — clean call lines with stats below (e.g. `· +3 / -16` for edits, `· done (13 lines)` for bash), no duplicate icons
- 🟢🔴 Bash exit-code background coloring (green on success, red on error)

## Install

```bash
pi install npm:@glemsom/pi-my-look
```

## Customize

Edit the `ICONS`, `TAGLINE`, `SPLASH_COLORS`, and `BOX_WIDTH` constants at the top of the extension file. For npm installs you can override with a local copy or a fork.

## License

MIT
