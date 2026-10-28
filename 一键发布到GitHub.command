#!/bin/bash
set -euo pipefail
export PATH="/usr/local/bin:/opt/homebrew/bin:$PATH"
LOG=/tmp/poetry-publish-log.txt
exec > >(tee "$LOG") 2>&1
echo "START $(date)"

# --- 自动找能访问 GitHub 的本地代理（Clash / Surge 等）---
pick_proxy() {
  local p code
  for p in 7890 7897 1087 6152 20171 10809 9191 8888 8080; do
    code=$(curl -sS -o /dev/null -w "%{http_code}" --connect-timeout 3 \
      -x "http://127.0.0.1:$p" https://github.com 2>/dev/null || true)
    if [ "$code" = "200" ]; then
      echo "http://127.0.0.1:$p"
      return 0
    fi
  done
  return 1
}

unset_bad_cursor_proxy() {
  # Cursor 沙箱注入的代理在本机 Terminal 里常无效，先清掉再自检
  unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
  unset SOCKS_PROXY SOCKS5_PROXY socks_proxy socks5_proxy
  unset GIT_HTTP_PROXY GIT_HTTPS_PROXY
}

unset_bad_cursor_proxy

PROXY=""
if PROXY=$(pick_proxy); then
  echo "using local proxy: $PROXY"
  export http_proxy="$PROXY" https_proxy="$PROXY"
  export HTTP_PROXY="$PROXY" HTTPS_PROXY="$PROXY"
  export ALL_PROXY="$PROXY" all_proxy="$PROXY"
  export GIT_HTTP_PROXY="$PROXY" GIT_HTTPS_PROXY="$PROXY"
else
  echo "probing direct..."
  if ! curl -sS -o /dev/null --connect-timeout 8 https://github.com 2>/dev/null; then
    cat <<'EOF'

❌ 本机连不上 github.com（直连超时，也没找到可用的本地代理端口）。

请先做下面任意一件，再重新双击本脚本：
  1) 打开 Clash / Surge / 其他梯子，并开启「系统代理」或「增强模式」
  2) 确认浏览器能打开 https://github.com

常用本地端口会自动探测：7890 / 7897 / 1087 / 6152 / 20171 / 10809

EOF
    exit 1
  fi
  echo "direct GitHub OK"
fi

echo "gh user: $(gh api user --jq .login)"
cd /Users/hxx/streamlit-converter/dagongren-toolbox/zhongwen-shige
export GIT_DIR=/tmp/zhongwen-shige.git
export GIT_WORK_TREE=/Users/hxx/streamlit-converter/dagongren-toolbox/zhongwen-shige

# recreate local git if needed
if [ ! -d /tmp/zhongwen-shige.git ]; then
  rm -f .git
  git init -b main --separate-git-dir=/tmp/zhongwen-shige.git
  git add -A
  git -c user.name='iliunian1111' -c user.email='394481670@qq.com' commit -m "初始化中文诗歌全库与 GitHub Pages 网站"
fi

# create repo
if gh repo view iliunian1111/zhongwen-shige >/dev/null 2>&1; then
  echo "repo already exists"
else
  echo "creating repo..."
  gh repo create zhongwen-shige --public --description "中文诗歌 · 古典诗词全库 JSON 与网页"
fi

TOKEN=$(gh auth token)
git remote remove origin 2>/dev/null || true
git remote add origin "https://x-access-token:${TOKEN}@github.com/iliunian1111/zhongwen-shige.git"
git config http.version HTTP/1.1
git config http.postBuffer 524288000

echo "pushing large repo (may take several minutes)..."
git push -u origin main

echo "enabling pages..."
gh api -X POST repos/iliunian1111/zhongwen-shige/pages -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/' || true
gh api -X PUT repos/iliunian1111/zhongwen-shige/pages -f build_type=legacy -f 'source[branch]=main' -f 'source[path]=/' || true

echo REPO=https://github.com/iliunian1111/zhongwen-shige
echo PAGES=https://iliunian1111.github.io/zhongwen-shige/
echo DONE
echo DONE > /tmp/poetry-publish-done.txt
echo "按任意键关闭..."
read -r _ || true
