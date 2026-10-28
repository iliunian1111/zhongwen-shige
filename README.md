# 中文诗歌

面向阅读的古典诗词站点：今日一诗、精选书库、全库分卷翻阅、检索与本地收藏。

- 网页：https://iliunian1111.github.io/zhongwen-shige/
- 数据来源：[chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)
- 原始 JSON 仍在 `data/`，供网页与后续小程序按需加载

## 本地预览

```bash
cd zhongwen-shige
python3 -m http.server 8765
# 打开 http://127.0.0.1:8765
```

重新生成书库索引：

```bash
python3 scripts/build_library.py
```

## 说明

站点只展示可读篇目，不暴露原始文件目录；作者小传、脚本、空目录等不会出现在书库里。收藏保存在浏览器本地。
