# lhf-luo 的个人主页

基于 Hexo 8 + Butterfly 5，使用 pnpm 管理依赖，通过 GitHub Actions 发布到 GitHub Pages。

访问地址：https://lhf-luo.github.io/

## 本地使用

环境：Node.js 24 LTS、pnpm 11.24.0（package.json 已固定版本）。

```bash
pnpm install --frozen-lockfile
pnpm server
```

打开 http://localhost:4000，按 Ctrl+C 停止预览。

```bash
pnpm clean
pnpm build
pnpm check
```

`pnpm check` 检查已生成页面中的本地链接与资源；它不检查外部 CDN 可用性。

## 修改内容

| 内容 | 文件 |
| --- | --- |
| 标题、作者、网址 | `_config.yml` |
| 导航、头像路径、公告、GitHub 按钮 | `_config.butterfly.yml` |
| 间距、配色、文章卡片 | `source/css/custom.css` |
| 初始占位头像 | `source/img/avatar.svg` |
| 个人介绍 | `source/about/index.md` |
| 文章 | `source/_posts/*.md` |
| 新文章默认格式 | `scaffolds/post.md` |

替换头像：将照片放入 `source/img/avatar.png`，然后把主题配置中的 `avatar.img` 改成 `/img/avatar.png`。也可以一并修改 `favicon`。

欢迎文章和两篇带“示例模板”的文章只是初始内容，可修改或删除。所有分类、标签和侧栏统计均由文章自动生成，不需要手工填数量。

新建文章：

```bash
pnpm exec hexo new "文章标题"
```

编辑生成的 Markdown；在顶部的 YAML 区域设置 `categories`、`tags` 和 `description`，后者显示为首页摘要。

## 首次发布到 GitHub

### 推荐：使用 Git 提交源码

以下适用于远程仓库为空的情况，在项目根目录执行一次：

```bash
git init
git branch -M main
git remote add origin https://github.com/lhf-luo/lhf-luo.github.io.git
git add .
git commit -m "Initialize personal homepage"
git -c http.proxy=http://127.0.0.1:7890 push -u origin main
```

代理参数仅用于这一条命令，不会修改全局配置。若远程已有提交，先获取并确认合并方式，不要强制推送。GitHub 身份验证请通过本机 Git 凭据管理器完成，不要将令牌写入文件。

### 使用 GitHub 网页上传

也可以上传项目源码至 `main` 分支的仓库根目录，但务必保留子目录结构，并包含隐藏的 `.github/workflows/deploy.yml` 和 `.gitignore`。

不要上传 `node_modules/`、`public/`、`db.json` 或日志文件。`pnpm-lock.yaml`、`pnpm-workspace.yaml` 和 `package.json` 必须上传。

### GitHub Pages 设置

1. 打开仓库 **Settings → Pages**。
2. 将 **Build and deployment → Source** 设为 **GitHub Actions**。
3. 打开 **Actions → Deploy Hexo to GitHub Pages**。
4. 如果首次构建因尚未开启 Pages 失败，完成设置后点击 **Re-run all jobs**；也可以在工作流页面选择 **Run workflow → main**。
5. 工作流成功后，访问 https://lhf-luo.github.io/ 。

此工作流构建并上传 `public/` 产物，不需要 `gh-pages` 分支，也不需要配置个人访问令牌。

## 日常更新

```bash
pnpm exec hexo new "新的文章标题"
# 编辑 Markdown 后：
pnpm build
pnpm check
git add .
git commit -m "Update blog"
git -c http.proxy=http://127.0.0.1:7890 push
```

也可以直接在 GitHub 网页编辑 `source/_posts/` 内的文章，提交后会自动发布。

## 说明

- 本项目只覆盖必要的 Butterfly 配置，其余沿用主题默认设置。
- 核心主题 CSS 和脚本随网站构建，图标等部分第三方资源仍使用主题默认 CDN；外网受限时可能加载较慢。
- 本站不配置评论和访问统计，也不包含个人邮箱、学校或研究经历等未经确认的信息。
