#!/bin/bash
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
cd /Users/hxx/streamlit-converter/dagongren-toolbox/zhongwen-shige
export GIT_DIR=/tmp/zhongwen-shige.git
export GIT_WORK_TREE=/Users/hxx/streamlit-converter/dagongren-toolbox/zhongwen-shige

echo "==> 当前账号"
gh auth status || { echo "请先运行: gh auth login"; exit 1; }
USER=$(gh api user --jq .login)
echo "用户: $USER"

if [ ! -d "$GIT_DIR" ]; then
  echo "==> 初始化并提交"
  rm -f .git
  git init -b main --separate-git-dir="$GIT_DIR"
  git add -A
  git -c user.name="$USER" -c user.email='394481670@qq.com' commit -m "初始化中文诗歌全库与 GitHub Pages 网站"
fi

echo "==> 创建仓库（如已存在则跳过）"
gh repo view "$USER/zhongwen-shige" >/dev/null 2>&1 || \
  gh repo create zhongwen-shige --public --description "中文诗歌 · 古典诗词全库 JSON 与网页"

TOKEN=$(gh auth token)
git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:${TOKEN}@github.com/${USER}/zhongwen-shige.git"

echo "==> 推送中（约 70MB+ 压缩对象，可能要几分钟）..."
git push -u origin main

echo "==> 开启 GitHub Pages"
gh api -X POST "repos/$USER/zhongwen-shige/pages" -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/' 2>/dev/null || true
gh api -X PUT "repos/$USER/zhongwen-shige/pages" -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/' 2>/dev/null || true

echo ""
echo "✅ 完成"
echo "仓库: https://github.com/$USER/zhongwen-shige"
echo "网页: https://$USER.github.io/zhongwen-shige/"
echo ""
read -n 1 -s -r -p "按任意键关闭..."
