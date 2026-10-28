#!/usr/bin/env python3
"""Build curated library.json + author indexes for the reading site."""
from __future__ import annotations

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "library.json"
INDEX_DIR = ROOT / "indexes"
DAILY = ROOT / "daily-pool.json"


def load_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def count_poems_in_list(data) -> int:
    return len(data) if isinstance(data, list) else 0


def flatten_mengxue_poetry(data) -> list:
    """唐诗三百首 / 千家诗 nested format → flat poems."""
    out = []
    content = data.get("content") if isinstance(data, dict) else None
    if not isinstance(content, list):
        return out
    for block in content:
        if not isinstance(block, dict):
            continue
        items = block.get("content") or []
        genre = block.get("type") or ""
        for item in items:
            if not isinstance(item, dict):
                continue
            out.append(
                {
                    "title": item.get("chapter") or item.get("title") or "无题",
                    "author": (item.get("author") or "").replace("（唐）", "").replace("(唐)", ""),
                    "paragraphs": item.get("paragraphs") or [],
                    "tags": [genre] if genre else [],
                }
            )
    return out


def write_flat_cache(src: Path, dest_name: str) -> tuple[str, int]:
    """Materialize nested anthology into a flat readable JSON under data/site/."""
    site = DATA / "site"
    site.mkdir(exist_ok=True)
    dest = site / dest_name
    poems = flatten_mengxue_poetry(load_json(src))
    dest.write_text(json.dumps(poems, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return f"data/site/{dest_name}", len(poems)


def shard_files(folder: Path, prefix: str) -> list[str]:
    files = []
    for p in sorted(folder.glob(f"{prefix}*.json")):
        name = p.name
        if "2019" in name:
            continue
        # natural-ish: poet.tang.0.json before poet.tang.1000.json by numeric suffix
        files.append(p)
    def key(p: Path):
        m = re.search(r"(\d+)\.json$", p.name)
        return int(m.group(1)) if m else 0
    files = sorted(files, key=key)
    return [f"data/{folder.relative_to(DATA)}/{p.name}".replace("\\", "/") for p in files]


def count_shards(paths: list[str]) -> int:
    total = 0
    for rel in paths:
        p = ROOT / rel
        if p.exists():
            total += count_poems_in_list(load_json(p))
    return total


def build_author_index(paths: list[str], out_name: str) -> int:
    mapping: dict[str, list[int]] = defaultdict(list)
    for rel in paths:
        p = ROOT / rel
        data = load_json(p)
        if not isinstance(data, list):
            continue
        m = re.search(r"(\d+)\.json$", p.name)
        shard = int(m.group(1)) if m else 0
        authors = {item.get("author") for item in data if isinstance(item, dict) and item.get("author")}
        for a in authors:
            if shard not in mapping[a]:
                mapping[a].append(shard)
    for a in mapping:
        mapping[a].sort()
    INDEX_DIR.mkdir(exist_ok=True)
    out = INDEX_DIR / out_name
    out.write_text(json.dumps(mapping, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return len(mapping)


def main():
    shelves = []

    # --- 精选读本（小文件，一次读完） ---
    tang300_path, tang300_n = write_flat_cache(DATA / "蒙学/tangshisanbaishou.json", "唐诗三百首.json")
    qianjia_path, qianjia_n = write_flat_cache(DATA / "蒙学/qianjiashi.json", "千家诗.json")

    featured = [
        {
            "id": "tang300",
            "name": "唐诗三百首",
            "era": "唐",
            "blurb": "童蒙启蒙，也是最常翻的唐诗选本。",
            "mode": "single",
            "files": [tang300_path],
            "count": tang300_n,
            "group": "精选",
        },
        {
            "id": "qianjiashi",
            "name": "千家诗",
            "era": "唐宋",
            "blurb": "短诗易记，适合日课背诵。",
            "mode": "single",
            "files": [qianjia_path],
            "count": qianjia_n,
            "group": "精选",
        },
        {
            "id": "song300",
            "name": "宋词三百首",
            "era": "宋",
            "blurb": "长短句里的心事与风景。",
            "mode": "single",
            "files": ["data/宋词/宋词三百首.json"],
            "count": count_poems_in_list(load_json(DATA / "宋词/宋词三百首.json")),
            "group": "精选",
        },
        {
            "id": "shijing",
            "name": "诗经",
            "era": "先秦",
            "blurb": "风雅颂，中国诗歌的源头。",
            "mode": "single",
            "files": ["data/诗经/shijing.json"],
            "count": count_poems_in_list(load_json(DATA / "诗经/shijing.json")),
            "group": "精选",
        },
        {
            "id": "chuci",
            "name": "楚辞",
            "era": "先秦",
            "blurb": "香草美人，楚辞的长歌。",
            "mode": "single",
            "files": ["data/楚辞/chuci.json"],
            "count": count_poems_in_list(load_json(DATA / "楚辞/chuci.json")),
            "group": "精选",
        },
        {
            "id": "huajian",
            "name": "花间集",
            "era": "五代",
            "blurb": "词之鼻祖，温韦一脉。",
            "mode": "multi",
            "files": [
                f"data/五代诗词/huajianji/{p.name}"
                for p in sorted((DATA / "五代诗词/huajianji").glob("huajianji-*-juan.json"))
            ],
            "count": 0,
            "group": "精选",
        },
        {
            "id": "nantang",
            "name": "南唐词",
            "era": "五代",
            "blurb": "李璟李煜，亡国之音亦动人。",
            "mode": "single",
            "files": ["data/五代诗词/nantang/poetrys.json"],
            "count": count_poems_in_list(load_json(DATA / "五代诗词/nantang/poetrys.json")),
            "group": "精选",
        },
        {
            "id": "caocao",
            "name": "曹操诗集",
            "era": "魏晋",
            "blurb": "老骥伏枥，志在千里。",
            "mode": "single",
            "files": ["data/曹操诗集/caocao.json"],
            "count": count_poems_in_list(load_json(DATA / "曹操诗集/caocao.json")),
            "group": "精选",
        },
        {
            "id": "nalan",
            "name": "纳兰性德",
            "era": "清",
            "blurb": "清水芙蓉，清朝第一词人。",
            "mode": "single",
            "files": ["data/纳兰性德/纳兰性德诗集.json"],
            "count": count_poems_in_list(load_json(DATA / "纳兰性德/纳兰性德诗集.json")),
            "group": "精选",
        },
        {
            "id": "shuimo",
            "name": "水墨唐诗",
            "era": "唐",
            "blurb": "画意诗心，短章小品。",
            "mode": "single",
            "files": ["data/水墨唐诗/shuimotangshi.json"],
            "count": count_poems_in_list(load_json(DATA / "水墨唐诗/shuimotangshi.json")),
            "group": "精选",
        },
    ]
    featured[5]["count"] = count_shards(featured[5]["files"])
    shelves.extend(featured)

    # --- 全库（分卷加载，不暴露文件名） ---
    tang_files = shard_files(DATA / "全唐诗", "poet.tang.")
    song_files = shard_files(DATA / "全唐诗", "poet.song.")
    ci_files = shard_files(DATA / "宋词", "ci.song.")

    corpora = [
        {
            "id": "quan-tang",
            "name": "全唐诗",
            "era": "唐",
            "blurb": "五万七千余首，按卷翻阅或按作者查找。",
            "mode": "shards",
            "files": tang_files,
            "count": count_shards(tang_files),
            "group": "全库",
            "authorIndex": "indexes/authors-tang.json",
            "volumeLabel": "卷",
        },
        {
            "id": "quan-song-shi",
            "name": "全宋诗",
            "era": "宋",
            "blurb": "宋人诗作分卷全库，体量较大。",
            "mode": "shards",
            "files": song_files,
            "count": count_shards(song_files),
            "group": "全库",
            "authorIndex": "indexes/authors-song-shi.json",
            "volumeLabel": "卷",
        },
        {
            "id": "quan-song-ci",
            "name": "全宋词",
            "era": "宋",
            "blurb": "两万余首词，可按词牌与作者检索。",
            "mode": "shards",
            "files": ci_files,
            "count": count_shards(ci_files),
            "group": "全库",
            "authorIndex": "indexes/authors-ci.json",
            "volumeLabel": "卷",
        },
        {
            "id": "yuanqu",
            "name": "元曲",
            "era": "元",
            "blurb": "散曲与剧曲唱词合集。",
            "mode": "single",
            "files": ["data/元曲/yuanqu.json"],
            "count": count_poems_in_list(load_json(DATA / "元曲/yuanqu.json")),
            "group": "全库",
        },
    ]
    shelves.extend(corpora)

    library = {
        "title": "中文诗歌",
        "subtitle": "开卷有诗，可查可藏可诵",
        "shelves": shelves,
        "totalPoems": sum(s["count"] for s in shelves),
    }
    OUT.write_text(json.dumps(library, ensure_ascii=False, indent=2), encoding="utf-8")
    print("wrote", OUT, "shelves", len(shelves), "total", library["totalPoems"])

    n1 = build_author_index(tang_files, "authors-tang.json")
    n2 = build_author_index(song_files, "authors-song-shi.json")
    n3 = build_author_index(ci_files, "authors-ci.json")
    print("author indexes", n1, n2, n3)

    # daily pool from featured small anthologies
    pool = []
    for shelf in featured:
        if shelf["id"] in {"tang300", "qianjiashi", "song300", "shijing", "nantang", "caocao", "shuimo"}:
            for rel in shelf["files"]:
                data = load_json(ROOT / rel)
                if not isinstance(data, list):
                    continue
                for item in data:
                    if not isinstance(item, dict):
                        continue
                    title = item.get("title") or item.get("rhythmic") or item.get("chapter") or ""
                    lines = item.get("paragraphs") or item.get("content") or []
                    if not lines:
                        continue
                    pool.append(
                        {
                            "title": title or "无题",
                            "author": item.get("author") or "佚名",
                            "lines": lines if isinstance(lines, list) else [str(lines)],
                            "rhythmic": item.get("rhythmic") or "",
                            "shelf": shelf["name"],
                            "source": rel,
                        }
                    )
    DAILY.write_text(json.dumps(pool, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print("daily pool", len(pool))


if __name__ == "__main__":
    main()
