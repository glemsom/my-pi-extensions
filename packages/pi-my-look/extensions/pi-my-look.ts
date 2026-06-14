/**
 * pi-my-look — Modern UI polish for pi
 *
 * Slick modern UI polish for the pi coding agent:
 *   - Tool rendering with inline icons and diff/result previews
 *   - Knight Rider animated working indicator
 *
 * Install: pi install npm:@glemsom/pi-my-look
 */

import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import {
  createBashTool,
  createEditTool,
  createReadTool,
  createWriteTool,
  keyHint,
  type BashToolDetails,
  type EditToolDetails,
  type ReadToolDetails,
} from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";

// ─────────────────────────────────────────────────────────────────────────────
// CONFIG — tweak these to taste
// ─────────────────────────────────────────────────────────────────────────────

function capitalize(str: string): string {
  if (!str) return "";
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── PULSATING DOT ──────────────────────────────────────────────────────────
// Unicode circles ordered from emptiest → fullest → emptiest to simulate
// a breathing/pulsating indicator while a tool-call is in progress.

const PULSE_FRAMES = ["○", "◔", "◐", "◕", "●", "◕", "◐", "◔"];
const PULSE_INTERVAL_MS = 140;

function getDot(context: any, theme: any): string {
  if (context?.isPartial) {
    const frame = Math.floor(Date.now() / PULSE_INTERVAL_MS) % PULSE_FRAMES.length;
    return theme.fg("warning", PULSE_FRAMES[frame]);
  }
  if (context?.isError) {
    return theme.fg("error", "●");
  }
  return theme.fg("success", "●");
}

// ─── WORKING INDICATOR: Knight Rider cyan scan on "Working..." ────────

const BRAILLE_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const THINKING_TEXT = "Working...";
const KR_PEAK = { r: 0, g: 255, b: 255 };     // bright cyan (hot spot)
const KR_BASE = { r: 20, g: 60, b: 70 };      // dark teal (cold / off state)

/**
 * Build combined frames: braille spinner + Knight Rider scanning text.
 * Each frame shifts the cyan "hot spot" across the working label — the glow
 * sweeps left-to-right and wraps, just like the KITT scanner.  Characters far
 * from the hot spot fade toward dark blue instead of black so they stay readable.
 */
function knightRiderThinkingFrames(): string[] {
  const textLen = THINKING_TEXT.length;
  const frameCount = BRAILLE_FRAMES.length;

  // Make a bidirectional sweep (forward then backward) for a smoother Knight Rider effect
  const sweepLen = frameCount * 2 - 2; // e.g. 10 -> 18 frames
  const frames: string[] = [];

  // Gaussian width (controls how wide/soft the glow is)
  const sigma = 1.0;

  for (let i = 0; i < sweepLen; i++) {
    // forwardIdx goes 0..frameCount-1 then back to 0
    const forwardIdx = i < frameCount ? i : sweepLen - i;

    // Map frame index → scan position along the text (linear sweep across the label)
    const scanPos = (forwardIdx / (frameCount - 1)) * (textLen - 1);

    // Colorize and optionally bold the braille spinner glyph so it feels part of the same animation
    const braille = BRAILLE_FRAMES[forwardIdx];
    const braillePos = (forwardIdx / (frameCount - 1)) * (textLen - 1);
    const brailleDist = Math.abs(braillePos - scanPos);
    // Gaussian falloff for a smooth soft glow
    const brailleT = Math.exp(- (brailleDist * brailleDist) / (2 * sigma * sigma));
    const br = Math.round(KR_BASE.r + (KR_PEAK.r - KR_BASE.r) * brailleT);
    const bg = Math.round(KR_BASE.g + (KR_PEAK.g - KR_BASE.g) * brailleT);
    const bb = Math.round(KR_BASE.b + (KR_PEAK.b - KR_BASE.b) * brailleT);

    const brailleBold = brailleT > 0.85; // hottest braille frames get bold
    const coloredBraille = brailleBold
      ? `\x1b[1m\x1b[38;2;${br};${bg};${bb}m${braille}\x1b[0m`
      : `\x1b[38;2;${br};${bg};${bb}m${braille}\x1b[0m`;

    // Build colored text; bold the single hottest character for extra emphasis
    const hotIndex = Math.round(scanPos);
    let colored = "";
    for (let c = 0; c < textLen; c++) {
      const dist = Math.abs(c - scanPos);
      // Gaussian falloff: softer, more natural glow than linear
      const t = Math.exp(- (dist * dist) / (2 * sigma * sigma)); // 1 = hot spot, ->0 = far away
      const r = Math.round(KR_BASE.r + (KR_PEAK.r - KR_BASE.r) * t);
      const g = Math.round(KR_BASE.g + (KR_PEAK.g - KR_BASE.g) * t);
      const b = Math.round(KR_BASE.b + (KR_PEAK.b - KR_BASE.b) * t);

      if (c === hotIndex) {
        // hottest char: bold + colored
        colored += `\x1b[1m\x1b[38;2;${r};${g};${b}m${THINKING_TEXT[c]}\x1b[0m`;
      } else {
        colored += `\x1b[38;2;${r};${g};${b}m${THINKING_TEXT[c]}\x1b[0m`;
      }
    }

    frames.push(`${coloredBraille} ${colored}`);
  }

  return frames;
}

// ─────────────────────────────────────────────────────────────────────────────
// EXTENSION
// ─────────────────────────────────────────────────────────────────────────────

export default function (pi: ExtensionAPI) {
  const cwd = process.cwd();

  pi.on("session_start", async (_event, ctx) => {
    // Knight Rider cyan scanning text on the working indicator
    ctx.ui.setWorkingIndicator({
      frames: knightRiderThinkingFrames(),
    });
    ctx.ui.setWorkingMessage("");
  });

  // ─── TOOL ICONS: override 4 built-ins ─────────────────────────────────────

  // Invisible placeholder returned by renderResult when nothing to show.
  const EMPTY: { render: () => string[]; invalidate: () => void } = { render: () => [], invalidate: () => {} };

  // Read
  const originalRead = createReadTool(cwd);
  pi.registerTool({
    name: "read",
    label: "read",
    description: originalRead.description,
    parameters: originalRead.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      return originalRead.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, context) {
      const dot = getDot(context, theme);
      const title = theme.fg("toolTitle", theme.bold(capitalize("read")));
      const path = theme.fg("accent", args.path);
      let text = `${dot} ${title}(${path})`;
      if (!context.expanded && !context.isPartial) {
        text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial || !expanded) return EMPTY;

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

      // Build result: preview (15 lines expanded); stats only when expanded
      let resultText = "";

      if (content?.type === "text") {
        const allLines = content.text.split("\n");
        const lineCount = allLines.length;
        const previewLines = 15;
        if (lineCount > 0) {
          resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
          const lines = allLines.slice(0, previewLines);
          for (const line of lines) resultText += `\n${theme.fg("dim", line)}`;
          if (lineCount > previewLines) {
            const remaining = lineCount - previewLines;
            resultText += `\n${theme.fg("muted", `… ${remaining} more`)}`;
          }
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
    },
  });

  // Write
  const originalWrite = createWriteTool(cwd);
  pi.registerTool({
    name: "write",
    label: "write",
    description: originalWrite.description,
    parameters: originalWrite.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      return originalWrite.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, context) {
      const dot = getDot(context, theme);
      const title = theme.fg("toolTitle", theme.bold(capitalize("write")));
      const path = theme.fg("accent", args.path);
      let text = `${dot} ${title}(${path})`;
      if (!context.expanded && !context.isPartial) {
        text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial || !expanded) return EMPTY;

      const content = result.content[0];
      let stats: string;
      if (content?.type === "text" && content.text.startsWith("Error")) {
        stats = content.text.split("\n")[0]!;
      } else {
        stats = "written";
      }

      // Build result: preview (15 lines expanded)
      let resultText = "";

      if (content?.type === "text" && !content.text.startsWith("Error")) {
        const allLines = content.text.split("\n");
        const lineCount = allLines.length;
        const previewLines = 15;
        if (lineCount > 0) {
          resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
          const lines = allLines.slice(0, previewLines);
          for (const line of lines) resultText += `\n${theme.fg("dim", line)}`;
          if (lineCount > previewLines) {
            const remaining = lineCount - previewLines;
            resultText += `\n${theme.fg("muted", `… ${remaining} more`)}`;
          }
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
    },
  });

  // Edit
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
    renderCall(args, theme, context) {
      const dot = getDot(context, theme);
      const title = theme.fg("toolTitle", theme.bold(capitalize("edit")));
      const path = theme.fg("accent", args.path);
      let text = `${dot} ${title}(${path})`;
      if (!context.expanded && !context.isPartial) {
        text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial || !expanded) return EMPTY;

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

      // Build result: diff preview (30 lines expanded)
      let resultText = "";

      if (details?.diff) {
        const diffLines = details.diff.split("\n");
        const lineCount = diffLines.length;
        const previewLines = 30;
        if (lineCount > 0) {
          resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
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
            resultText += `\n${theme.fg("muted", `… ${remaining} more`)}`;
          }
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
    },
  });

  // Bash
  const originalBash = createBashTool(cwd);
  pi.registerTool({
    name: "bash",
    label: "bash",
    description: originalBash.description,
    parameters: originalBash.parameters,
    renderShell: "self",
    async execute(toolCallId, params, signal, onUpdate) {
      return originalBash.execute(toolCallId, params, signal, onUpdate);
    },
    renderCall(args, theme, context) {
      const dot = getDot(context, theme);
      const title = theme.fg("toolTitle", theme.bold(capitalize("bash")));
      const lines = args.command.split('\n').filter((l) => l.trim());

      let cmd: string;
      if (lines.length > 1) {
        const indent = " ".repeat(7); // "● Bash(" is 7 characters
        cmd = lines.map((line, i) => i === 0 ? line : indent + line).join('\n');
      } else {
        cmd = args.command;
      }

      const coloredCmd = theme.fg("accent", cmd);
      let text = `${dot} ${title}(${coloredCmd})`;
      if (!context.expanded && !context.isPartial) {
        text += " " + theme.fg("muted", "(") + keyHint("app.tools.expand", "to expand") + theme.fg("muted", ")");
      }
      return new Text(text, 0, 0);
    },
    renderResult(result, { expanded, isPartial }, theme, _context) {
      if (isPartial || !expanded) return EMPTY;

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

      // Build result: output preview (20 lines expanded)
      let resultText = "";

      const previewLines = 20;
      if (lineCount > 0) {
        resultText += `\n${theme.fg("dim", `· ${stats}`)}`;
        const lines = allLines.slice(0, previewLines);
        for (const line of lines) resultText += `\n${theme.fg("dim", line)}`;
        if (lineCount > previewLines) {
          const remaining = lineCount - previewLines;
          resultText += `\n${theme.fg("muted", `… ${remaining} more`)}`;
        }
      }
      if (!resultText) resultText = `\n${theme.fg("dim", `· ${stats}`)}`;

      return new Text(resultText, 0, 0);
    },
  });

  // ─── CLEANUP ──────────────────────────────────────────────────────────────

  pi.on("session_shutdown", async () => {
    // no-op: nothing to tear down
  });
}
