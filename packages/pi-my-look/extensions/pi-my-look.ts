/**
 * pi-my-look — Modern UI polish for pi
 *
 * Slick modern UI polish for the pi coding agent:
 *   - Branded splash on session start (typewriter reveal + fade-out)
 *   - Tool icons (🔍 read · 📝 write · ✏️ edit · ⚡ bash) inline in chat
 *
 * Install: pi install npm:@glemsom/pi-my-look
 *
 * Customize: edit ICONS, TAGLINE, SPLASH_COLORS, BOX_WIDTH below.
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  type BashToolDetails,
  type EditToolDetails,
  type ReadToolDetails,
} from "@earendil-works/pi-coding-agent";
import { Text, truncateToWidth } from "@earendil-works/pi-tui";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — tweak these to taste
// ─────────────────────────────────────────────────────────────────────────────

const ICONS = {
  read: "🔍",
  write: "📝",
  edit: "✏️",
  bash: "⚡",
} as const;

const TAGLINE = "pi-my-look";

// Splash ANSI gradient color stops (top → bottom).
// DimLevel shrinks each channel for fade-out transitions.
const SPLASH_COLORS: readonly number[][] = [
  [255, 120, 200],
  [220, 140, 240],
  [180, 160, 255],
  [140, 200, 255],
  [100, 220, 220],
  [120, 255, 180],
  [200, 255, 120],
];

const BOX_WIDTH = 44; // inner content width between borders

/** Build the 7-line splash widget dynamically.
 *  tagline  — partial or full tag (empty = not yet revealed)
 *  dimLevel — 1.0 = full brightness, 0.0 = gone (fade steps)
 *  cursor   — show blinking block-cursor after tagline */
function buildSplashLines(tagline: string, dimLevel: number, cursor: boolean): string[] {
  const d = (i: number): string => {
    const [r, g, b] = SPLASH_COLORS[i]!;
    return `\x1b[38;2;${Math.round(r * dimLevel)};${Math.round(g * dimLevel)};${Math.round(b * dimLevel)}m`;
  };

  const tag = tagline || " ";
  const cur = cursor ? d(4) + "\x1b[5m▊\x1b[25m" : "";
  const pad = BOX_WIDTH - 9 - tag.length - 2 - (cursor ? 1 : 0);

  return [
    d(0) + "  ╭" + "─".repeat(BOX_WIDTH) + "╮\x1b[0m",
    d(1) + "  │" + " ".repeat(BOX_WIDTH) + "│\x1b[0m",
    d(2) + "  │    \x1b[1mπ  AGENT\x1b[0m" + d(2) + " ".repeat(BOX_WIDTH - 12) + "│\x1b[0m",
    d(3) + "  │" + " ".repeat(BOX_WIDTH) + "│\x1b[0m",
    d(4) + "  │       \x1b[3m· \x1b[1m" + tag + "\x1b[0m" + d(4) + "\x1b[3m ·\x1b[0m" + cur + d(4) + " ".repeat(Math.max(0, pad)) + "│\x1b[0m",
    d(5) + "  │" + " ".repeat(BOX_WIDTH) + "│\x1b[0m",
    d(6) + "  ╰" + "─".repeat(BOX_WIDTH) + "╯\x1b[0m",
  ];
}

// Persistent brand widget above editor (empty = no static text).
const BRAND_WIDGET: string[] = [];

const WIDGET_KEY = "pi-modern-brand";
const SPLASH_DURATION_MS = 2500;

// ─────────────────────────────────────────────────────────────────────────────
// EXTENSION
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();

  // State
  let splashTimer: ReturnType<typeof setTimeout> | null = null;
  let splashActive = false;

  // ─── SPLASH: typewriter reveal + fade-out exit ──────────────────────────

  let typewriterTimer: ReturnType<typeof setInterval> | null = null;
  let cursorTimer: ReturnType<typeof setInterval> | null = null;
  let fadeTimer: ReturnType<typeof setInterval> | null = null;
  let typewriterPos = 0;
  let cursorVisible = true;
  let typewriterDone = false;
  let fadingOut = false;

  function dismissSplash(ctx: ExtensionContext) {
    if (!splashActive || fadingOut) return;
    fadingOut = true;

    // Kill all running animations
    if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
    if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
    if (splashTimer) { clearTimeout(splashTimer); splashTimer = null; }

    // Fade out: 5 steps over ~300 ms
    const fadeSteps = [1.0, 0.7, 0.45, 0.2, 0.0];
    let step = 0;
    const displayTag = typewriterDone ? TAGLINE : TAGLINE.slice(0, typewriterPos) || TAGLINE;

    fadeTimer = setInterval(() => {
      step++;
      if (step >= fadeSteps.length) {
        // Fully gone — tear down splash
        if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }
        splashActive = false;
        fadingOut = false;
        ctx.ui.setWidget(WIDGET_KEY, BRAND_WIDGET);
        return;
      }
      ctx.ui.setWidget(WIDGET_KEY, buildSplashLines(displayTag, fadeSteps[step]!, false));
    }, 75);
  }

  pi.on("session_start", async (event, ctx) => {
    if (event.reason === "startup" || event.reason === "new") {
      splashActive = true;
      typewriterPos = 0;
      typewriterDone = false;
      fadingOut = false;
      cursorVisible = true;

      // Render empty box (tagline not yet revealed)
      ctx.ui.setWidget(WIDGET_KEY, buildSplashLines("", 1.0, true));
      // Typewriter: reveal tagline char by char (~40 ms / char)
      typewriterTimer = setInterval(() => {
        typewriterPos++;
        if (typewriterPos > TAGLINE.length) {
          // Reveal complete — switch to cursor blink
          clearInterval(typewriterTimer!);
          typewriterTimer = null;
          typewriterDone = true;

          cursorTimer = setInterval(() => {
            cursorVisible = !cursorVisible;
            ctx.ui.setWidget(WIDGET_KEY, buildSplashLines(TAGLINE, 1.0, cursorVisible));
          }, 400);
          return;
        }
        ctx.ui.setWidget(WIDGET_KEY, buildSplashLines(TAGLINE.slice(0, typewriterPos), 1.0, true));
      }, 40);

      // Auto-dismiss after SPLASH_DURATION_MS
      splashTimer = setTimeout(() => dismissSplash(ctx), SPLASH_DURATION_MS);
    } else {
      ctx.ui.setWidget(WIDGET_KEY, BRAND_WIDGET);
    }
  });

  // User input → fast-forward typewriter then trigger fade-out
  pi.on("input", async (_event, ctx) => {
    if (!splashActive) return;
    if (typewriterTimer) { clearInterval(typewriterTimer); typewriterTimer = null; }
    if (cursorTimer) { clearInterval(cursorTimer); cursorTimer = null; }
    typewriterPos = TAGLINE.length;
    typewriterDone = true;
    dismissSplash(ctx);
  });

  // ─── TOOL ICONS: override 4 built-ins ─────────────────────────────────────

  // Invisible placeholder returned by renderResult when nothing to show.
  const EMPTY: { render: () => string[]; invalidate: () => void } = { render: () => [], invalidate: () => {} };

  // Read: 🔍
  const originalRead = createReadTool(cwd);
  pi.registerTool({
    name: "read",
    label: "read",
    description: originalRead.description,
    parameters: originalRead.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return originalRead.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, _context) {
      return new Text(
        theme.fg("toolTitle", theme.bold(`${ICONS.read} read `)) +
          theme.fg("accent", args.path),
        0,
        0
      );
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial) return EMPTY;

      const details = result.details as ReadToolDetails | undefined;
      const content = result.content[0];

      // Compute stats line
      let stats = "";
      if (content?.type === "image") {
        stats = "image loaded";
      } else if (content?.type !== "text") {
        stats = "no content";
      } else {
        const allLines = content.text.split("\n");
        stats = `${allLines.length} lines`;
        if (details?.truncation?.truncated) stats += ` (truncated from ${details.truncation.totalLines})`;
      }

      // Build result: preview (5 lines collapsed, 15 expanded); stats only when expanded or no preview
      let resultText = "";

      if (content?.type === "text") {
        const allLines = content.text.split("\n");
        const lineCount = allLines.length;
        const previewLines = expanded ? 15 : 5;
        if (lineCount > 0) {
          if (expanded) resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
          const lines = allLines.slice(0, previewLines);
          for (const line of lines) resultText += `\n${theme.fg("dim", line)}`;
          if (lineCount > previewLines) {
            const remaining = lineCount - previewLines;
            resultText += `\n${theme.fg("muted", expanded ? `… ${remaining} more` : `… ${remaining} more — ctrl+o to expand`)}`;
          }
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
    },
  });

  // Write: 📝
  const originalWrite = createWriteTool(cwd);
  pi.registerTool({
    name: "write",
    label: "write",
    description: originalWrite.description,
    parameters: originalWrite.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return originalWrite.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, _context) {
      const lineCount = args.content.split("\n").length;
      return new Text(
        theme.fg("toolTitle", theme.bold(`${ICONS.write} write `)) +
          theme.fg("accent", args.path) +
          theme.fg("dim", ` (${lineCount} lines)`),
        0,
        0
      );
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial) return EMPTY;

      const content = result.content[0];
      let stats: string;
      if (content?.type === "text" && content.text.startsWith("Error")) {
        stats = content.text.split("\n")[0]!;
      } else {
        stats = "written";
      }

      // Build result: preview (5 lines collapsed, 15 expanded); stats only when expanded or no preview
      let resultText = "";

      if (content?.type === "text" && !content.text.startsWith("Error")) {
        const allLines = content.text.split("\n");
        const lineCount = allLines.length;
        const previewLines = expanded ? 15 : 5;
        if (lineCount > 0) {
          if (expanded) resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
          const lines = allLines.slice(0, previewLines);
          for (const line of lines) resultText += `\n${theme.fg("dim", line)}`;
          if (lineCount > previewLines) {
            const remaining = lineCount - previewLines;
            resultText += `\n${theme.fg("muted", expanded ? `… ${remaining} more` : `… ${remaining} more — ctrl+o to expand`)}`;
          }
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
    },
  });

  // Edit: ✏️
  const originalEdit = createEditTool(cwd);
  pi.registerTool({
    name: "edit",
    label: "edit",
    description: originalEdit.description,
    parameters: originalEdit.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      return originalEdit.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, _context) {
      return new Text(
        theme.fg("toolTitle", theme.bold(`${ICONS.edit} edit `)) +
          theme.fg("accent", args.path),
        0,
        0
      );
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial) return EMPTY;

      const details = result.details as EditToolDetails | undefined;
      const content = result.content[0];

      // Compute stats line
      let stats: string;
      if (content?.type === "text" && content.text.startsWith("Error")) {
        stats = content.text.split("\n")[0]!;
      } else if (!details?.diff) {
        stats = "applied";
      } else {
        const diffLines = details.diff.split("\n");
        let additions = 0;
        let removals = 0;
        for (const line of diffLines) {
          if (line.startsWith("+") && !line.startsWith("+++")) additions++;
          if (line.startsWith("-") && !line.startsWith("---")) removals++;
        }
        stats = `+${additions} / -${removals}`;
      }

      // Build result: diff preview (5 lines collapsed, 30 expanded); stats only when expanded or no diff
      let resultText = "";

      if (details?.diff) {
        const diffLines = details.diff.split("\n");
        const lineCount = diffLines.length;
        const previewLines = expanded ? 30 : 5;
        if (lineCount > 0) {
          if (expanded) resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
          for (const line of diffLines.slice(0, previewLines)) {
            if (line.startsWith("+") && !line.startsWith("+++")) {
              resultText += `\n${theme.fg("success", line)}`;
            } else if (line.startsWith("-") && !line.startsWith("---")) {
              resultText += `\n${theme.fg("error", line)}`;
            } else {
              resultText += `\n${theme.fg("dim", line)}`;
            }
          }
          if (lineCount > previewLines) {
            const remaining = lineCount - previewLines;
            resultText += `\n${theme.fg("muted", expanded ? `… ${remaining} more` : `… ${remaining} more — ctrl+o to expand`)}`;
          }
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
    },
  });

  // Bash: ⚡
  const originalBash = createBashTool(cwd);
  pi.registerTool({
    name: "bash",
    label: "bash",
    description: originalBash.description,
    parameters: originalBash.parameters,
    async execute(toolCallId, params, signal, onUpdate) {
      return originalBash.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, _context) {
      const cmd = truncateToWidth(args.command, 60, "…");
      let prefix = theme.fg("toolTitle", theme.bold(`${ICONS.bash} $ `));
      prefix += theme.fg("accent", cmd);
      if (args.timeout) prefix += theme.fg("dim", ` (timeout: ${args.timeout}s)`);
      return new Text(prefix, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, context) {
      if (isPartial) return EMPTY;

      const details = result.details as BashToolDetails | undefined;
      const content = result.content[0];
      const output = content?.type === "text" ? content.text : "";
      const exitMatch = output.match(/exit code: (\d+)/);
      const exitCode = exitMatch ? parseInt(exitMatch[1], 10) : null;
      const allLines = output.split("\n").filter((l) => l.trim());
      const lineCount = allLines.length;

      // Compute stats line
      let stats = "";
      if (exitCode === 0 || exitCode === null) {
        stats += "done";
      } else {
        stats += `exit ${exitCode}`;
      }
      stats += ` (${lineCount} lines)`;
      if (details?.truncation?.truncated) stats += " [truncated]";



      // Build result: output preview (5 lines collapsed, 20 expanded); stats only when expanded or no output
      let resultText = "";

      const previewLines = expanded ? 20 : 5;
      if (lineCount > 0) {
        if (expanded) resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
        const lines = allLines.slice(0, previewLines);
        for (const line of lines) resultText += `\n${theme.fg("dim", line)}`;
        if (lineCount > previewLines) {
          const remaining = lineCount - previewLines;
          resultText += `\n${theme.fg("muted", expanded ? `… ${remaining} more` : `… ${remaining} more — ctrl+o to expand`)}`;
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
    },
  });

  // ─── CLEANUP ──────────────────────────────────────────────────────────────

  pi.on("session_shutdown", async (_event, ctx) => {
    if (splashTimer) clearTimeout(splashTimer);
    if (typewriterTimer) clearInterval(typewriterTimer);
    if (cursorTimer) clearInterval(cursorTimer);
    if (fadeTimer) clearInterval(fadeTimer);
    splashActive = false;
    fadingOut = false;
    ctx.ui.setWidget(WIDGET_KEY, undefined);
  });
}
