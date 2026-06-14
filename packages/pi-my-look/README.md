# pi-my-look

Version 0.1.10

Modern UI polish for the [pi coding agent](https://github.com/earendil-works/pi-coding-agent).


- Clean flat tool call lines starting with a status dot `●` (green for success, red for error, yellow for executing/partial) instead of default boxed backgrounds
- Capitalized tool names with arguments in parentheses (e.g., `Edit(/path/to/file)` or `Bash(command)`)
- Multi-line bash commands are indented for readability, with continuation lines aligned under the first line
- Execution results hidden by default when collapsed with a `(ctrl+o to expand)` hint, and fully visible (preview/stats) when expanded
- 🚗 Knight Rider cyan scanning text on the "Working..." indicator — a glowing hot spot sweeps across the label while a braille spinner animates

## Changelog

- 0.1.10 (2026-06-14)
  - Add pulsating dot animation (○ ◔ ◐ ◕ ●) for in-progress tool calls.

- 0.1.9 (2026-06-14)
  - Fix docs: describe Knight Rider color as cyan (not amber).
  - Remove startup splash and associated timers.
  - Improve the working indicator: bidirectional sweep, Gaussian glow, and integrated braille spinner.

## Install

```bash
pi install npm:@glemsom/pi-my-look
```

## Customize

Edit the `KR_PEAK` and `KR_BASE` constants in packages/pi-my-look/extensions/pi-my-look.ts to change the scanning and base colors. For npm installs you can override with a local copy or a fork.

## License

MIT
