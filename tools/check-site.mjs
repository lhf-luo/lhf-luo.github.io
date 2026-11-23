import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve('public');
assert(fs.existsSync(root), '请先运行 pnpm build');
const pages = fs.readdirSync(root, { recursive: true })
  .filter(file => file.endsWith('.html'));
const missing = [];

for (const page of pages) {
  const html = fs.readFileSync(path.join(root, page), 'utf8');
  for (const match of html.matchAll(/(?:href|src)="(\/[^"?#]*)(?:[?#][^"]*)?"/g)) {
    if (match[1].startsWith('//')) continue;
    let target = path.join(root, decodeURIComponent(match[1]));
    if (fs.existsSync(target) && fs.statSync(target).isDirectory()) {
      target = path.join(target, 'index.html');
    }
    if (!fs.existsSync(target)) missing.push(`${page}: ${match[1]}`);
  }
}

assert.deepEqual(missing, [], '发现无效的站内链接');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
for (const text of ['/css/custom.css', '/img/avatar.svg', 'Follow Me', '/about/']) {
  assert(home.includes(text), `首页缺少 ${text}`);
}
assert(/class="recent-post-item(?:\s|")/.test(home), '首页应显示文章卡片');
console.log(`检查通过：${pages.length} 个 HTML 页面，站内链接和本地资源均有效。`);
