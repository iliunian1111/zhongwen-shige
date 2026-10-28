# 中文诗歌

古典中文诗歌开源全库网站与 JSON 数据仓。

数据主要拷贝自 [chinese-poetry/chinese-poetry](https://github.com/chinese-poetry/chinese-poetry)，用于学习、展示，以及后续小程序按需调用。

## 目录

- `data/`：全量 JSON（唐诗、宋诗、宋词、元曲、诗经等）
- `index.html`：GitHub Pages 网页入口
- `catalog.json`：书库目录索引
- `assets/`：网页样式与脚本

## 本地预览

```bash
cd 中文诗歌目录
python3 -m http.server 8080
```

浏览器打开 `http://localhost:8080`

## GitHub Pages

仓库 Settings → Pages → Source 选 `main` / `/ (root)`。  
发布后访问：

`https://<你的用户名>.github.io/zhongwen-shige/`

（若仓库名不同，把最后一段换成实际仓库名）

## 说明

- 单仓数据约 **170MB+**，克隆与推送需要一些时间
- 网页按「书库 → 数据文件 → 分页列表」浏览，避免一次加载全部
- 小程序调用方式后续再接；本仓先作为数据源与网站

## License

见 `LICENSE`。原始数据版权与许可遵循 chinese-poetry 项目。
