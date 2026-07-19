import { readFileSync } from "node:fs";
//#region src/md2idx.ts
const INACTIVE_FENCE = {
	active: false,
	char: "",
	len: 0
};
const NO_PARAGRAPH = -1;
const stripInlineMarkup = (text) => text.replace(/!\[(?<text>[^\]]*)\]\([^)]*\)/g, "$<text>").replace(/\[(?<text>[^\]]*)\]\([^)]*\)/g, "$<text>").replace(/\[(?<text>[^\]]*)\]\[[^\]]*\]/g, "$<text>").replace(/``(?<text>[^`]*)``/g, "$<text>").replace(/`(?<text>[^`]*)`/g, "$<text>").replace(/\*{1,3}(?<text>[^*]+)\*{1,3}/g, "$<text>").replace(/_{1,3}(?<text>[^_]+)_{1,3}/g, "$<text>").replace(/~~(?<text>[^~]+)~~/g, "$<text>");
const stripAtxTrailing = (line) => line.replace(/\s+#+\s*$/, "");
const FENCE_RE = /^ {0,3}(?<marker>`{3,}|~{3,})/;
const ATX_RE = /^ {0,3}(?<hashes>#{1,6})\s/;
const updateFenceState = (line, fence) => {
	const opening = FENCE_RE.exec(line);
	if (!opening) return fence;
	if (!fence.active) return {
		active: true,
		char: opening[1][0],
		len: opening[1].length
	};
	const closing = /^ {0,3}(?<marker>`{3,}|~{3,})\s*$/.exec(line);
	if (closing && line.trimStart().startsWith(fence.char) && closing[1].length >= fence.len) return INACTIVE_FENCE;
	return fence;
};
const tryAtxHeading = (line, offset) => {
	const match = ATX_RE.exec(line);
	if (!match) return null;
	const depth = match[1].length;
	const rawText = line.slice(match[0].length);
	return {
		depth,
		offset,
		text: stripInlineMarkup(stripAtxTrailing(rawText).trim())
	};
};
const isSetextH1 = (line) => /^ {0,3}={1,}\s*$/.test(line);
const isSetextH2 = (line) => /^ {0,3}-{2,}\s*$/.test(line);
const setextDepth = (line) => {
	if (isSetextH1(line)) return 1;
	if (isSetextH2(line)) return 2;
	return null;
};
const trySetextFromState = (state, line, markdown) => {
	if (state.paragraphStartOffset === NO_PARAGRAPH || state.prevWasFenceBoundary) return null;
	const depth = setextDepth(line);
	if (depth === null) return null;
	const rawText = markdown.slice(state.paragraphStartOffset, state.offset).trimEnd();
	const text = stripInlineMarkup(rawText.split("\n").map((pl) => pl.trim()).join(" "));
	return {
		depth,
		offset: state.paragraphStartOffset,
		text
	};
};
const resetState = (ctx, wasFenceBoundary) => ({
	fence: ctx.fence,
	offset: ctx.nextOffset,
	paragraphStartOffset: NO_PARAGRAPH,
	prevWasFenceBoundary: wasFenceBoundary
});
const paragraphStart = (state) => {
	if (state.paragraphStartOffset === NO_PARAGRAPH) return state.offset;
	return state.paragraphStartOffset;
};
const extendParagraph = (state, ctx) => ({
	fence: ctx.fence,
	offset: ctx.nextOffset,
	paragraphStartOffset: paragraphStart(state),
	prevWasFenceBoundary: false
});
const isIndentedCode = (line) => /^ {4,}\S/.test(line);
const isBlockStart = (line) => /^ {0,3}(?:[-*+]|\d{1,9}[.)]) /.test(line) || line.trimStart().startsWith(">");
const findHeading = (state, line, markdown) => tryAtxHeading(line, state.offset) ?? trySetextFromState(state, line, markdown);
const processLine = (state, line, ctx) => {
	if (ctx.fence.active || ctx.fence !== state.fence) return resetState(ctx, true);
	if (!line.trim() || isIndentedCode(line) || isBlockStart(line)) return resetState(ctx, false);
	const heading = findHeading(state, line, ctx.markdown);
	if (heading) {
		ctx.headings.push(heading);
		return resetState(ctx, false);
	}
	return extendParagraph(state, ctx);
};
const parseHeadings = (markdown) => {
	const lines = markdown.split("\n");
	const headings = [];
	const initial = {
		fence: INACTIVE_FENCE,
		offset: 0,
		paragraphStartOffset: NO_PARAGRAPH,
		prevWasFenceBoundary: false
	};
	lines.reduce((state, line) => {
		const fence = updateFenceState(line, state.fence);
		const nextOffset = state.offset + line.length + 1;
		return processLine(state, line, {
			fence,
			headings,
			markdown,
			nextOffset
		});
	}, initial);
	return headings;
};
const getFirstOffset = (headings, markdownLength) => {
	if (headings.length > 0) return headings[0].offset;
	return markdownLength;
};
const getSectionEnd = (headings, idx, markdownLength) => {
	const next = headings[idx + 1];
	if (next) return next.offset;
	return markdownLength;
};
const buildPreamble = (markdown, firstOffset) => {
	if (firstOffset <= 0) return {
		indexLines: [],
		sections: []
	};
	const preamble = markdown.slice(0, firstOffset).trimEnd();
	if (!preamble) return {
		indexLines: [],
		sections: []
	};
	return {
		indexLines: ["0."],
		sections: [preamble]
	};
};
const normalizeCrlf = (text) => text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
const md2idx = (markdown) => {
	const normalized = normalizeCrlf(markdown);
	const headings = parseHeadings(normalized);
	const firstOffset = getFirstOffset(headings, normalized.length);
	const preamble = buildPreamble(normalized, firstOffset);
	const headingSections = headings.map((heading, idx) => {
		const end = getSectionEnd(headings, idx, normalized.length);
		return normalized.slice(heading.offset, end).trimEnd();
	});
	const headingIndex = headings.map((heading, idx) => {
		return `${"#".repeat(heading.depth)} ${idx + preamble.sections.length}. ${heading.text}`;
	});
	return {
		index: [...preamble.indexLines, ...headingIndex].join("\n"),
		sections: [...preamble.sections, ...headingSections]
	};
};
const USAGE = "Usage: md2idx [file] [--pretty] [--help]\n";
const readInput = (filePath) => {
	if (filePath) return readFileSync(filePath, "utf8");
	return readFileSync(0, "utf8");
};
const parseCliArgs = (args) => {
	const sepIdx = args.indexOf("--");
	if (sepIdx !== -1) return {
		flags: args.slice(0, sepIdx).filter((arg) => arg.startsWith("-")),
		positionals: [...args.slice(0, sepIdx).filter((arg) => !arg.startsWith("-")), ...args.slice(sepIdx + 1)]
	};
	return {
		flags: args.filter((arg) => arg.startsWith("-")),
		positionals: args.filter((arg) => !arg.startsWith("-"))
	};
};
const KNOWN_FLAGS = /* @__PURE__ */ new Set([
	"--pretty",
	"--help",
	"-h"
]);
const emitResult = (parsed) => {
	const pretty = parsed.flags.includes("--pretty");
	const filePath = parsed.positionals[0] ?? null;
	const result = md2idx(readInput(filePath));
	if (pretty) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
	else process.stdout.write(`${JSON.stringify(result)}\n`);
};
const runCli = (argv) => {
	const parsed = parseCliArgs(argv);
	const hasHelp = parsed.flags.includes("--help") || parsed.flags.includes("-h");
	const unknownFlag = parsed.flags.find((flag) => !KNOWN_FLAGS.has(flag));
	const hasError = Boolean(unknownFlag) || parsed.positionals.length > 1;
	if (hasHelp || hasError) {
		process.stderr.write(USAGE);
		process.exitCode = Number(hasError);
		return;
	}
	emitResult(parsed);
};
//#endregion
export { md2idx, runCli };
