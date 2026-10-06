/*
 * Subset the custom fonts into woff2 so the site doesn't ship ~96MB of fonts.
 *
 *   - `SFPro.ttf`      -> `SFPro.woff2`   (Latin / digits / punctuation)
 *   - `PingFangUI.ttc` -> `PingFang.woff2` (CJK, using the SC face, font-number 0)
 *
 * Glyph coverage is derived from the actual text rendered on the site:
 *   - src (all .tsx / .ts): JSX text + string literals + site.config.ts
 *   - posts / comments markdown (blog + comment content)
 *
 * Pure-Node implementation. Subsetting is done with `harfbuzzjs` (a WebAssembly
 * build of HarfBuzz / hb-subset) and woff2 conversion with `fontverter` -- no
 * Python / fonttools and no native build step required. The HarfBuzz WASM heap
 * view is re-fetched after every allocation (memory may grow), which avoids the
 * stale-heap crash that bites the higher-level `subset-font` wrapper on large
 * fonts such as the 70MB PingFang collection.
 *
 * Run:  npm run fonts
 */
import { readFileSync, writeFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const FONTS = resolve(ROOT, 'src', 'fonts');

const SRC_FONT_SF = resolve(FONTS, 'SFPro.ttf');
const SRC_FONT_PF = resolve(FONTS, 'PingFangUI.ttc');
const OUT_SF = resolve(FONTS, 'SFPro.woff2');
const OUT_PF = resolve(FONTS, 'PingFang.woff2');

const SCAN_GLOBS: Array<[string, string]> = [
  ['src', '.tsx'],
  ['src', '.ts'],
  ['posts', '.md'],
  ['comments', '.md'],
];

// --- HarfBuzz subsetter (WASM) -----------------------------------------------
// The hb-subset wasm caps its heap at ~65MB and cannot grow. PingFang's SC face
// is ~65MB on its own, so a single shared instance cannot load it. We patch the
// wasm's Memory section to raise the heap to 512MB (the existing limits are 2-byte
// LEB128, so they can be replaced in place without shifting the rest of the file),
// then compile once and instantiate a FRESH instance per subset so each font gets a
// clean heap.
const TARGET_PAGES = 8192; // 8192 * 64KB = 512MB

function readLEB(buf: Buffer, pos: number): [number, number] {
  let result = 0;
  let shift = 0;
  while (true) {
    const byte = buf[pos++];
    result |= (byte & 0x7f) << shift;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [result, pos];
}

function encodeLEB(n: number): Buffer {
  const out: number[] = [];
  do {
    let byte = n & 0x7f;
    n >>>= 7;
    if (n !== 0) byte |= 0x80;
    out.push(byte);
  } while (n !== 0);
  return Buffer.from(out);
}

function raiseWasmMemoryLimit(bytes: Buffer): Buffer {
  let i = 8; // skip magic + version
  while (i < bytes.length) {
    const sectionId = bytes[i++];
    const [secSize, afterSize] = readLEB(bytes, i);
    const secStart = afterSize;
    const secEnd = secStart + secSize;
    if (sectionId === 5) {
      // Memory section
      let p = secStart;
      const count = bytes[p++];
      if (count !== 1) throw new Error(`Unexpected memory count: ${count}`);
      const flag = bytes[p++];
      const [, afterInitial] = readLEB(bytes, p);
      const initialLen = afterInitial - p;
      if ((flag & 1) === 0) throw new Error('Memory has no maximum to raise');
      const [, afterMax] = readLEB(bytes, afterInitial);
      const maxLen = afterMax - afterInitial;

      const initBytes = encodeLEB(TARGET_PAGES);
      const maxBytes = encodeLEB(TARGET_PAGES);
      if (initBytes.length !== initialLen || maxBytes.length !== maxLen) {
        throw new Error(
          `Cannot raise memory limit in place (LEB width mismatch: ${initialLen}->${initBytes.length}, ${maxLen}->${maxBytes.length})`
        );
      }
      const repl = Buffer.concat([Buffer.from([count, flag]), initBytes, maxBytes]);
      return Buffer.concat([bytes.subarray(0, secStart), repl, bytes.subarray(secEnd)]);
    }
    i = secEnd;
  }
  throw new Error('Memory section not found in wasm');
}

const rawWasm = readFileSync(require.resolve('harfbuzzjs/hb-subset.wasm'));
const patchedWasm = raiseWasmMemoryLimit(rawWasm);
const wasmModule = new WebAssembly.Module(patchedWasm);

// HarfBuzz constants used below.
const HB_MEMORY_MODE_WRITABLE = 2;
const HB_SUBSET_FLAGS_NO_HINTING = 0x1; // matches the old `pyftsubset --no-hinting`

/**
 * Subset an SFNT (TrueType/OpenType) buffer keeping only the code points in
 * `text`, returning a new SFNT buffer. The WASM memory view is refreshed after
 * each allocation because `malloc` may grow the heap (invalidating old views).
 */
async function hbSubsetSfnt(originalFont: Buffer, text: string): Promise<Buffer> {
  // Fresh instance per call -> clean 65MB heap.
  const instance = (await WebAssembly.instantiate(wasmModule, {})) as any;
  const hb = instance.exports as any;

  const fontBuffer = hb.malloc(originalFont.byteLength);
  // Memory may have grown inside malloc -> get a fresh view before copying in.
  new Uint8Array(hb.memory.buffer).set(new Uint8Array(originalFont), fontBuffer);

  const input = hb.hb_subset_input_create_or_fail();
  if (input === 0) throw new Error('hb_subset_input_create_or_fail failed');

  try {
    // Drop hinting to keep the woff2 small (CJK hints are large). HarfBuzz's
    // default subset behaviour already prunes unused layout features, matching
    // pyftsubset's default (we don't force-keep every feature).
    const flags = hb.hb_subset_input_get_flags(input);
    hb.hb_subset_input_set_flags(input, flags | HB_SUBSET_FLAGS_NO_HINTING);

    // Add the unicode code points we want to keep.
    const unicodeSet = hb.hb_subset_input_unicode_set(input);
    for (const c of text) hb.hb_set_add(unicodeSet, c.codePointAt(0) ?? 0);

    const blob = hb.hb_blob_create(fontBuffer, originalFont.byteLength, HB_MEMORY_MODE_WRITABLE, 0, 0);
    const face = hb.hb_face_create(blob, 0);
    hb.hb_blob_destroy(blob);

    const subset = hb.hb_subset_or_fail(face, input);
    hb.hb_face_destroy(face);
    if (subset === 0) throw new Error('hb_subset_or_fail failed (corrupted input?)');

    const result = hb.hb_face_reference_blob(subset);
    const offset = hb.hb_blob_get_data(result, 0);
    const length = hb.hb_blob_get_length(result);
    if (length === 0) throw new Error('subset produced an empty blob');

    // Read the result out with a fresh view (memory may have grown again).
    const out = Buffer.from(new Uint8Array(hb.memory.buffer).subarray(offset, offset + length));

    hb.hb_blob_destroy(result);
    hb.hb_face_destroy(subset);
    return out;
  } finally {
    hb.hb_subset_input_destroy(input);
    hb.free(fontBuffer);
  }
}

/**
 * Extract a single font face from a TrueType Collection (.ttc) as a standalone
 * SFNT buffer. `harfbuzzjs`/`fontverter` cannot read the `ttcf` wrapper directly.
 * In a TTC the per-face table directory's offsets are relative to the START OF
 * THE FILE, so we slice out face `index` and rebase every table offset to the new
 * (face-relative) start, producing a valid standalone TTF. Non-TTC buffers are
 * returned untouched.
 */
function extractTtcFace(buf: Buffer, index: number): Buffer {
  if (buf.readUInt32BE(0) !== 0x74746366) return buf; // 'ttcf'

  const numFonts = buf.readUInt32BE(8);
  if (index >= numFonts) {
    throw new Error(`TTC has only ${numFonts} faces, requested index ${index}`);
  }

  // Offset table starts at 12 (v1.0) or 28 (v2.0, which has a 16-byte dsig field).
  const firstOff = buf.readUInt32BE(12);
  const atFirst = buf.readUInt32BE(firstOff);
  const sfntOk =
    atFirst === 0x00010000 || atFirst === 0x4f54544f || atFirst === 0x74727565;
  const offsetTableStart = sfntOk ? 12 : 28;

  const off = buf.readUInt32BE(offsetTableStart + index * 4);
  const numTables = buf.readUInt16BE(off + 4);

  // Collect each table's absolute (file-relative) offset/length and the face end.
  const tableOffsets: number[] = [];
  let faceEnd = off;
  for (let i = 0; i < numTables; i++) {
    const entry = off + 12 + i * 16;
    const tableOff = buf.readUInt32BE(entry + 8);
    const length = buf.readUInt32BE(entry + 12);
    tableOffsets.push(tableOff);
    const end = tableOff + length;
    if (end > faceEnd) faceEnd = end;
  }

  // Slice the face out of the collection, then rebase the directory offsets.
  const out = Buffer.from(buf.subarray(off, faceEnd));
  for (let i = 0; i < numTables; i++) {
    const entry = 12 + i * 16; // directory now starts at byte 12 in `out`
    out.writeUInt32BE(tableOffsets[i] - off, entry + 8);
  }
  return out;
}

function collectFiles(base: string, ext: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of entries) {
      const full = resolve(dir, name);
      try {
        const st = statSync(full);
        if (st.isDirectory()) walk(full);
        else if (full.endsWith(ext)) out.push(full);
      } catch {
        /* ignore unreadable entries */
      }
    }
  };
  walk(base);
  return out;
}

function collectChars(): Set<string> {
  const chars = new Set<string>();
  for (const [sub, ext] of SCAN_GLOBS) {
    const base = resolve(ROOT, sub);
    if (!existsSync(base)) continue;
    for (const f of collectFiles(base, ext)) {
      let text: string;
      try {
        text = readFileSync(f, 'utf-8');
      } catch (e) {
        console.warn(`  skip ${f}: ${(e as Error).message}`);
        continue;
      }
      for (const ch of text) chars.add(ch);
    }
  }
  return chars;
}

function isCjk(ch: string): boolean {
  const o = ch.codePointAt(0) ?? 0;
  return (
    0x2e80 <= o && o <= 0x9fff ||
    0xf900 <= o && o <= 0xfaff ||
    0xff00 <= o && o <= 0xffef ||
    0x3000 <= o && o <= 0x303f ||
    0x3040 <= o && o <= 0x30ff ||
    0x3400 <= o && o <= 0x4dbf
  );
}

const fontverter = require('fontverter');

async function run(): Promise<void> {
  for (const f of [SRC_FONT_SF, SRC_FONT_PF]) {
    if (!existsSync(f)) {
      console.error(`ERROR: missing source font ${f}`);
      process.exit(1);
    }
  }

  const chars = collectChars();

  // Always include basic ASCII so any English/digits/punctuation render.
  const ascii = new Set<string>();
  for (let c = 0x20; c <= 0x7f; c++) ascii.add(String.fromCodePoint(c));

  const cjk = new Set<string>();
  for (const c of chars) if (isCjk(c)) cjk.add(c);
  // Include the fullwidth / CJK punctuation block.
  for (let c = 0x3000; c <= 0x303f; c++) cjk.add(String.fromCodePoint(c));

  const nonCjk = new Set<string>();
  for (const c of chars) if (!cjk.has(c)) nonCjk.add(c);
  for (const a of ascii) nonCjk.add(a);

  console.log(`Collected ${chars.size} unique chars (${cjk.size} CJK, ${nonCjk.size} non-CJK)`);

  // SF Pro: Latin / digits / punctuation
  const sfSfnt = await hbSubsetSfnt(readFileSync(SRC_FONT_SF), [...nonCjk].join(''));
  const sfOut = await fontverter.convert(sfSfnt, 'woff2', 'truetype');
  writeFileSync(OUT_SF, sfOut);

  // PingFang (SC face = font-number 0): CJK only
  const pfFace = extractTtcFace(readFileSync(SRC_FONT_PF), 0);
  const pfSfnt = await hbSubsetSfnt(pfFace, [...cjk].join(''));
  const pfOut = await fontverter.convert(pfSfnt, 'woff2', 'truetype');
  writeFileSync(OUT_PF, pfOut);

  for (const f of [OUT_SF, OUT_PF]) {
    const mb = statSync(f).size / 1_048_576;
    console.log(`  wrote ${f.split(/[\\/]/).pop()}: ${mb.toFixed(2)} MB`);
  }
  console.log('Done.');
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
