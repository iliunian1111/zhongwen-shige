#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")"

REPO_NAME="${1:-zhongwen-shige}"

echo "==> 检查 GitHub 登录"
if ! gh auth status >/dev/null 2>&1; then
  echo "请先登录：gh auth login"
  exit 1
fi

USER_NAME="$(gh api user --jq .login)"
echo "当前账号：$USER_NAME"
echo "仓库名：$REPO_NAME"

if [ ! -d .git ]; then
  echo "==> 初始化 git"
  git init -b main
fi

echo "==> 提交本地文件"
git add -A
if git diff --cached --quiet; then
  echo "没有新的暂存变更"
else
  git commit -m "初始化中文诗歌全库与 GitHub Pages 网站" || true
fi
git branch -M main

echo "==> 创建远程仓库（若已存在则跳过创建）"
if gh repo view "$USER_NAME/$REPO_NAME" >/dev/null 2>&1; then
  echo "远程仓库已存在"
else
  gh repo create "$REPO_NAME" --public --description "中文诗歌 · 古典诗词全库 JSON 与网页" --source=. --remote=origin
fi

if ! git remote get-url origin >/dev/null 2>&1; then
  git remote add origin "https://github.com/$USER_NAME/$REPO_NAME.git"
fi

echo "==> 推送（数据约 170MB+，可能需几分钟）"
git push -u origin main

echo "==> 开启 GitHub Pages"
gh api -X POST "repos/$USER_NAME/$REPO_NAME/pages" \
  -f "build_type=legacy" \
  -f "source[branch]=main" \
  -f "source[path]=/" \
  >/dev/null 2>&1 || gh api -X PUT "repos/$USER_NAME/$REPO_NAME/pages" \
  -f "build_type=legacy" \
  -f "source[branch]=main" \
  -f "source[path]=/" \
  >/dev/null 2>&1 || true

echo
echo "完成。"
echo "仓库：https://github.com/$USER_NAME/$REPO_NAME"
echo "网页：https://$USER_NAME.github.io/$REPO_NAME/"
echo "（Pages 首次生效可能要等 1～3 分钟）"
