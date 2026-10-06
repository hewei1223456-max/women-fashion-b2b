/**
 * 建立「页面路径 → 需预取的 chunk 文件」映射。
 *
 * 背景：用户反馈「打开很卡，要等很久才能跳转到下一个界面」。
 * 实测原因不是后端（本地接口 1-2ms），而是产物结构：
 *   - Taro 未做 vendor 拆分，首屏要下 app.js(395KB) + 1268.js(102KB)
 *   - 每个 Tab 的页面代码是独立 chunk，**点了才下载**（330-350KB），经公网隧道就是 1.5-3s 白等
 *
 * 产物里路由表长这样（app.js）：
 *   Te.routes=[{path:"pages/source/index",load:function(a,u){return[w.e(8311).then(w.bind(w,58311)),a,u]}},...]
 * 所以直接抓 `path:"xxx"` 与紧随其后的 `w.e(数字)` 即可，不用猜文件名。
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const H5 = path.join(ROOT, 'apps/miniapp/dist/h5');

/** 主包页面（分包页面不预取：它们按 Taro 的 preloadRule 处理，避免首屏抢带宽） */
const MAIN_ROUTES = [
  { path: 'pages/index/index', name: '资讯' },
  { path: 'pages/source/index', name: '货源' },
  { path: 'pages/tools/index', name: '功能' },
  { path: 'pages/profile/index', name: '我的' },
];

const readAll = (dir) => {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...readAll(p));
    else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
};

const allJs = readAll(H5);
const sizeOf = (f) => fs.statSync(path.join(H5, f)).size;
const exists = (f) => fs.existsSync(path.join(H5, f));

/** 抓 `path:"xxx"` 后面 200 字符内的 `w.e(ID)` */
const routeToId = new Map();
for (const file of allJs) {
  const src = fs.readFileSync(file, 'utf8');
  const re = /path:\s*"([A-Za-z0-9_/-]+)"[\s\S]{0,240}?\.e\((\d+)\)/g;
  for (const m of src.matchAll(re)) {
    if (!routeToId.has(m[1])) routeToId.set(m[1], m[2]);
  }
}

console.log('=== 页面 → 预取文件 ===');
const result = [];
for (const r of MAIN_ROUTES) {
  const id = routeToId.get(r.path);
  const js = id ? [`chunk/${id}.js`].filter(exists) : [];
  const css = id ? [`css/${id}.css`].filter(exists) : [];
  const files = [...js, ...css];
  const bytes = files.reduce((s, f) => s + sizeOf(f), 0);
  console.log(
    `  ${r.name.padEnd(4)} ${r.path.padEnd(24)} ${files.length} 文件 ${(bytes / 1024).toFixed(0).padStart(5)}KB  ${files.join(' ') || '（未解析到）'}`,
  );
  if (files.length) result.push({ name: r.name, files });
}

const total = result.reduce((s, r) => s + r.files.reduce((a, f) => a + sizeOf(f), 0), 0);
console.log(
  `\n预取合计 ${(total / 1024).toFixed(0)}KB —— 首屏 497KB 渲染完之后再后台拉，用户点 Tab 时文件已在缓存`,
);

if (!result.length) {
  console.error('\n❌ 未解析到任何映射，未写出文件');
  process.exit(1);
}

const outFile = path.join(H5, '.prefetch.json');
fs.writeFileSync(outFile, JSON.stringify(result, null, 2));
console.log(`已写出 ${path.relative(ROOT, outFile)}`);
