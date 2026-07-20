// ============================================================================
// jokura / tools/lint.mjs — 連結ソースの ESLint 検査（npm run lint / CI から実行）
//
// scripts/game/*.js は index.html の PARTS の順序で <script> として読み込まれ、
// 同一のグローバルスコープを共有する設計のため、1ファイルずつ lint しても
// 「他ファイル定義のグローバル参照」がすべて no-undef になってしまう。
// そこで実行時と同じ順序で全ファイルを連結した仮想ソースを lint し、
// タイポ由来の未定義参照・二重定義などをファイル横断で検出する。
// 報告される行番号は連結位置から元の ファイル:行 に変換して表示する。
// ============================================================================
import { readFileSync, readdirSync } from 'node:fs';
import { ESLint } from 'eslint';
import globals from 'globals';

// ─── index.html の PARTS 配列を唯一の読み込み順ソースとして解析する ───
const html = readFileSync('index.html', 'utf8');
const partsMatch = html.match(/var PARTS=\[([\s\S]*?)\];/);
if (!partsMatch) {
  console.error('index.html から PARTS 配列を見つけられませんでした');
  process.exit(1);
}
const parts = [...partsMatch[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);

// ─── PARTS と scripts/game/*.js の食い違い（載せ忘れ・消し忘れ）を検出 ───
const onDisk = readdirSync('scripts/game')
  .filter((f) => f.endsWith('.js'))
  .map((f) => f.replace(/\.js$/, ''));
const missing = onDisk.filter((f) => !parts.includes(f));
const unknown = parts.filter((p) => !onDisk.includes(p));
if (missing.length || unknown.length) {
  for (const f of missing) console.error(`ERROR: scripts/game/${f}.js が index.html の PARTS に載っていません`);
  for (const p of unknown) console.error(`ERROR: PARTS の '${p}' に対応する scripts/game/${p}.js がありません`);
  process.exit(1);
}

// ─── 実行時と同じ順序で連結し、連結行 → 元ファイル:行 の対応表を作る ───
let concat = '';
const lineMap = []; // lineMap[連結行-1] = {file, line}
for (const part of parts) {
  const path = `scripts/game/${part}.js`;
  const src = readFileSync(path, 'utf8');
  const lines = src.split('\n');
  for (let i = 0; i < lines.length; i++) lineMap.push({ file: path, line: i + 1 });
  concat += src.endsWith('\n') ? src : src + '\n';
}

// ─── 連結ソースを lint（実行時に存在するホスト提供グローバルのみ許可） ───
const eslint = new ESLint({
  overrideConfigFile: true,
  overrideConfig: {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'script',
      globals: {
        ...globals.browser,
        THREE: 'readonly', // three.js は index.html が先に読み込む
      },
    },
    rules: {
      // タイポ由来の未定義グローバル参照（typeof ガードは対象外になる）
      'no-undef': 'error',
      // 同名の関数/変数の二重定義（後勝ちで片方が死にコードになる事故を防ぐ）
      'no-redeclare': 'error',
      'no-dupe-args': 'error',
      'no-dupe-keys': 'error',
      'no-dupe-else-if': 'error',
      'no-duplicate-case': 'error',
      'no-const-assign': 'error',
      'no-func-assign': 'error',
      'no-obj-calls': 'error',
      'no-unreachable': 'error',
      'no-self-assign': 'error',
      'no-setter-return': 'error',
      'getter-return': 'error',
      'use-isnan': 'error',
      'valid-typeof': 'error',
    },
  },
});
const [result] = await eslint.lintText(concat, { filePath: 'concat.js' });

let errors = 0;
for (const msg of result.messages) {
  const loc = lineMap[msg.line - 1] || { file: 'concat.js', line: msg.line };
  const sev = msg.severity === 2 ? 'error' : 'warn';
  if (msg.severity === 2) errors++;
  console.log(`${loc.file}:${loc.line}:${msg.column}  ${sev}  ${msg.message}  [${msg.ruleId || 'parse'}]`);
}
if (errors) {
  console.error(`\n${errors} error(s)`);
  process.exit(1);
}
console.log(`OK: ${parts.length} files / ${lineMap.length} lines lint clean`);
