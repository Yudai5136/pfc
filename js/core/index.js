// core/index.js — core(DOM や localStorage に一切触れない純粋関数)の入口。各ファイルの関数と定数をまとめて公開する。
// アプリは `import * as core from './core/index.js'` で使い、main.js が window.PFC.core にも置く(テスト・デバッグ用)。
// Node.js のテストは tests/tools/load-core.js からこのファイルを読み込む。
export * from './constants.js';
export * from './format.js';
export * from './dates.js';
export * from './nutrition.js';
export * from './foods.js';
export * from './week.js';
export * from './shopping.js';
export * from './model.js';
