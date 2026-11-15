#!/usr/bin/env node
/**
 * Switch the language of the root README.md.
 *
 * Sources of truth : README.en.md / README.zh.md
 * Generated file   : README.md (what GitHub shows by default)
 *
 *   node scripts/switch-readme.mjs              # auto-detect from OS locale
 *   node scripts/switch-readme.mjs --lang zh    # force 简体中文
 *   node scripts/switch-readme.mjs --lang en    # force English
 *   node scripts/switch-readme.mjs --status     # print current language only
 *
 * Override detection with an env var: README_LANG=zh node scripts/switch-readme.mjs
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCES = { en: 'README.en.md', zh: 'README.zh.md' };
const TARGET = 'README.md';
const LANG_MARK = /<!--\s*README-LANG:\s*(en|zh)\s*-->/;
const LABEL = { en: 'English', zh: '简体中文' };

function normalize(value) {
  const lang = String(value ?? '').trim().toLowerCase();
  if (lang.startsWith('zh') || ['cn', 'chinese', 'zh-cn', 'zh-hans'].includes(lang)) return 'zh';
  if (lang.startsWith('en')) return 'en';
  console.error(`[readme] Unsupported language: "${value}" (use en or zh)`);
  process.exit(1);
}

function parseArgs(argv) {
  let mode = 'auto';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--lang' || arg === '-l') mode = normalize(argv[++i]);
    else if (arg.startsWith('--lang=')) mode = normalize(arg.slice('--lang='.length));
    else if (arg === '--status' || arg === 'status') mode = 'status';
    else if (arg === '--help' || arg === '-h') mode = 'help';
    else if (arg === '--sync' || arg === 'sync' || arg === '--en' || arg === 'en') mode = 'en';
    else if (arg === '--zh' || arg === 'zh') mode = 'zh';
    else if (arg === '--auto' || arg === 'auto' || arg === '--detect') mode = 'auto';
    else {
      console.error(`[readme] Unknown argument: ${arg}`);
      process.exit(1);
    }
  }
  return mode;
}

/** Detect the user's language from env vars, then the OS/ICU locale. */
function detectLanguage() {
  if (process.env.README_LANG) return normalize(process.env.README_LANG);
  const hints = [
    process.env.LC_ALL,
    process.env.LC_MESSAGES,
    process.env.LANG,
    Intl.DateTimeFormat().resolvedOptions().locale,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  return /zh[-_ ]?(cn|hans|sg|tw|hk)?|chinese/.test(hints) ? 'zh' : 'en';
}

function currentLanguage() {
  const target = resolve(ROOT, TARGET);
  if (!existsSync(target)) return 'unknown';
  const text = readFileSync(target, 'utf8');
  const mark = text.slice(0, 500).match(LANG_MARK);
  if (mark) return mark[1];
  // Legacy README without a marker: guess from CJK density.
  const cjk = (text.match(/[\u4e00-\u9fff]/g) ?? []).length;
  return cjk > 100 ? 'zh' : 'en';
}

function apply(lang) {
  const source = resolve(ROOT, SOURCES[lang]);
  if (!existsSync(source)) {
    console.error(`[readme] Missing source: ${SOURCES[lang]}`);
    process.exit(1);
  }
  // Drop leading HTML comments from the source; they are editor notes, not content.
  const body = readFileSync(source, 'utf8').replace(/^(?:<!--[\s\S]*?-->\s*)+/, '').trimStart();
  const output = [
    `<!-- README-LANG: ${lang} -->`,
    `<!-- Generated from ${SOURCES[lang]} by scripts/switch-readme.mjs. Edit the source, then run \`pnpm readme:sync\`. -->`,
    '',
    body,
  ].join('\n');

  const target = resolve(ROOT, TARGET);
  if (existsSync(target) && readFileSync(target, 'utf8') === output) {
    console.log(`[readme] README.md is already ${LABEL[lang]} — nothing to do.`);
    return;
  }
  writeFileSync(target, output, 'utf8');
  const kb = (Buffer.byteLength(output, 'utf8') / 1024).toFixed(1);
  console.log(`[readme] README.md → ${LABEL[lang]}  (from ${SOURCES[lang]}, ${kb} KB)`);
}

function help() {
  console.log(`Vibeboard README language switcher

Sources : README.en.md (English) · README.zh.md (简体中文)
Output  : README.md

  pnpm readme:auto    Detect the OS locale and switch README.md
  pnpm readme:zh      Switch README.md to 简体中文
  pnpm readme:en      Switch README.md to English
  pnpm readme:sync    Restore the English default from README.en.md
  pnpm readme:status  Print the current language, change nothing

Override detection: README_LANG=zh node scripts/switch-readme.mjs

Note: GitHub strips JavaScript from README files, so a README cannot detect a
visitor's language on its own. docs/index.html provides browser auto-detection
for GitHub Pages / local use, and the language bar at the top of both READMEs
always links to the two stable source files.`);
}

const mode = parseArgs(process.argv.slice(2));
if (mode === 'help') {
  help();
} else if (mode === 'status') {
  const lang = currentLanguage();
  console.log(`[readme] README.md is ${LABEL[lang] ?? 'unknown'} (${lang}).`);
} else {
  const lang = mode === 'auto' ? detectLanguage() : mode;
  apply(lang);
}
