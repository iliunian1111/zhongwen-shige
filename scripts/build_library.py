#!/usr/bin/env python3
"""Build a reader-first library map (not a file catalog)."""
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


def write_json(path: Path, obj, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    text = (
        json.dumps(obj, ensure_ascii=False, indent=2)
        if pretty
        else json.dumps(obj, ensure_ascii=False, separators=(",", ":"))
    )
    path.write_text(text, encoding="utf-8")


def flatten_mengxue_poetry(data) -> list:
    out = []
    content = data.get("content") if isinstance(data, dict) else None
    if not isinstance(content, list):
        return out
    for block in content:
        if not isinstance(block, dict):
            continue
        genre = block.get("type") or ""
        for item in block.get("content") or []:
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
    site = DATA / "site"
    site.mkdir(exist_ok=True)
    dest = site / dest_name
    poems = flatten_mengxue_poetry(load_json(src))
    write_json(dest, poems)
    return f"data/site/{dest_name}", len(poems)


def shard_files(folder: Path, prefix: str) -> list[str]:
    files = [p for p in folder.glob(f"{prefix}*.json") if "2019" not in p.name]

    def key(p: Path):
        m = re.search(r"(\d+)\.json$", p.name)
        return int(m.group(1)) if m else 0

    return [
        f"data/{folder.relative_to(DATA)}/{p.name}".replace("\\", "/")
        for p in sorted(files, key=key)
    ]


def count_list_file(rel: str) -> int:
    data = load_json(ROOT / rel)
    return len(data) if isinstance(data, list) else 0


def count_files(rels: list[str]) -> int:
    return sum(count_list_file(r) for r in rels)


def build_author_index(paths: list[str], out_name: str) -> dict:
    mapping: dict[str, list[int]] = defaultdict(list)
    counts: dict[str, int] = defaultdict(int)
    for rel in paths:
        p = ROOT / rel
        data = load_json(p)
        if not isinstance(data, list):
            continue
        m = re.search(r"(\d+)\.json$", p.name)
        shard = int(m.group(1)) if m else 0
        local: dict[str, int] = defaultdict(int)
        for item in data:
            if not isinstance(item, dict):
                continue
            a = item.get("author")
            if not a:
                continue
            local[a] += 1
        for a, n in local.items():
            counts[a] += n
            if shard not in mapping[a]:
                mapping[a].append(shard)
    for a in mapping:
        mapping[a].sort()
    INDEX_DIR.mkdir(exist_ok=True)
    write_json(INDEX_DIR / out_name, mapping)
    write_json(INDEX_DIR / out_name.replace("authors-", "counts-"), counts)
    return {"shards": mapping, "counts": counts}


def anthology(id_, name, era, form, blurb, files, count=None, why=""):
    return {
        "id": id_,
        "name": name,
        "era": era,
        "form": form,
        "blurb": blurb,
        "why": why,
        "mode": "anthology" if len(files) == 1 else "anthology-multi",
        "files": files,
        "count": count if count is not None else count_files(files),
    }


def main():
    tang300_path, tang300_n = write_flat_cache(DATA / "蒙学/tangshisanbaishou.json", "唐诗三百首.json")
    qianjia_path, qianjia_n = write_flat_cache(DATA / "蒙学/qianjiashi.json", "千家诗.json")

    tang_files = shard_files(DATA / "全唐诗", "poet.tang.")
    song_files = shard_files(DATA / "全唐诗", "poet.song.")
    ci_files = shard_files(DATA / "宋词", "ci.song.")
    huajian_files = [
        f"data/五代诗词/huajianji/{p.name}"
        for p in sorted((DATA / "五代诗词/huajianji").glob("huajianji-*-juan.json"))
    ]

    tang_idx = build_author_index(tang_files, "authors-tang.json")
    song_idx = build_author_index(song_files, "authors-song-shi.json")
    ci_idx = build_author_index(ci_files, "authors-ci.json")

    corpora = {
        "quan-tang": {
            "id": "quan-tang",
            "name": "全唐诗",
            "files": tang_files,
            "count": count_files(tang_files),
            "authorIndex": "indexes/authors-tang.json",
            "form": "诗",
            "era": "唐",
        },
        "quan-song-shi": {
            "id": "quan-song-shi",
            "name": "全宋诗",
            "files": song_files,
            "count": count_files(song_files),
            "authorIndex": "indexes/authors-song-shi.json",
            "form": "诗",
            "era": "宋",
        },
        "quan-song-ci": {
            "id": "quan-song-ci",
            "name": "全宋词",
            "files": ci_files,
            "count": count_files(ci_files),
            "authorIndex": "indexes/authors-ci.json",
            "form": "词",
            "era": "宋",
        },
    }

    path_rooms = [
        anthology(
            "shijing", "诗经", "先秦", "诗",
            "中国诗歌的源头，风雅颂。",
            ["data/诗经/shijing.json"],
            why="想从头认识诗，先从这里开始。",
        ),
        anthology(
            "chuci", "楚辞", "先秦", "诗",
            "香草美人，楚辞的长歌。",
            ["data/楚辞/chuci.json"],
            why="读懂浪漫与寄托的开端。",
        ),
        anthology(
            "tang300", "唐诗三百首", "唐", "诗",
            "最常被翻开的唐诗选本。",
            [tang300_path],
            tang300_n,
            why="建立语感、日课背诵的首选。",
        ),
        anthology(
            "qianjiashi", "千家诗", "唐宋", "诗",
            "短诗易记，适合随手诵读。",
            [qianjia_path],
            qianjia_n,
            why="篇幅短，适合每天记一两首。",
        ),
        anthology(
            "song300", "宋词三百首", "宋", "词",
            "长短句里的心事与风景。",
            ["data/宋词/宋词三百首.json"],
            why="入门宋词，不必先跳进两万首全库。",
        ),
        anthology(
            "huajian", "花间集", "五代", "词",
            "词之早期经典，温韦一脉。",
            huajian_files,
            why="想懂词怎样从诗里长出来。",
        ),
        anthology(
            "nantang", "南唐词", "五代", "词",
            "李璟李煜，亡国之音亦动人。",
            ["data/五代诗词/nantang/poetrys.json"],
            why="词境转向深情的关键节点。",
        ),
    ]

    def master_room(display: str, author_key: str, corpus_id: str, blurb: str):
        corp = corpora[corpus_id]
        if corpus_id == "quan-tang":
            counts, shards = tang_idx["counts"], tang_idx["shards"]
        elif corpus_id == "quan-song-shi":
            counts, shards = song_idx["counts"], song_idx["shards"]
        else:
            counts, shards = ci_idx["counts"], ci_idx["shards"]
        n = counts.get(author_key, 0)
        shard_nums = set(shards.get(author_key, []))
        files = []
        for rel in corp["files"]:
            m = re.search(r"(\d+)\.json$", rel)
            if m and int(m.group(1)) in shard_nums:
                files.append(rel)
        return {
            "id": f"master-{corpus_id}-{author_key}",
            "name": display,
            "era": corp["era"],
            "form": corp["form"],
            "blurb": blurb,
            "why": f"专架阅读，只看{display}的作品。",
            "mode": "author",
            "author": author_key,
            "corpus": corpus_id,
            "files": files,
            "count": n,
        }

    masters_tang = [
        master_room("李白", "李白", "quan-tang", "天上谪仙，酒与月与远方。"),
        master_room("杜甫", "杜甫", "quan-tang", "诗史与家国，沉郁顿挫。"),
        master_room("白居易", "白居易", "quan-tang", "晓畅如话，长歌也动人。"),
        master_room("王维", "王維", "quan-tang", "诗中有画，空山新雨。"),
        master_room("孟浩然", "孟浩然", "quan-tang", "山水清音，隐者之风。"),
        master_room("王昌龄", "王昌齡", "quan-tang", "七绝圣手，边塞与宫怨。"),
        master_room("刘禹锡", "劉禹錫", "quan-tang", "秋风庭树，诗豪之气。"),
        master_room("杜牧", "杜牧", "quan-tang", "俊爽拗峭，咏史含情。"),
        master_room("李商隐", "李商隱", "quan-tang", "深情绵邈，无题最难解。"),
        master_room("韩愈", "韓愈", "quan-tang", "文起八代，诗亦硬语。"),
        master_room("岑参", "岑參", "quan-tang", "轮台热海，边塞奇景。"),
        master_room("柳宗元", "柳宗元", "quan-tang", "清峭淡远，永州一脉。"),
    ]
    # 注意：全宋词作者名为简体，全宋诗多为繁体，键必须与源数据一致
    masters_song = [
        master_room("苏轼·词", "苏轼", "quan-song-ci", "豪放与深情，一词一天地。"),
        master_room("李清照", "李清照", "quan-song-ci", "易安体，愁与寻寻觅觅。"),
        master_room("辛弃疾", "辛弃疾", "quan-song-ci", "挑灯看剑，词中有烈士。"),
        master_room("柳永", "柳永", "quan-song-ci", "凡有井水处，皆能歌柳词。"),
        master_room("欧阳修", "欧阳修", "quan-song-ci", "疏隽深婉，北宋气象。"),
        master_room("秦观", "秦观", "quan-song-ci", "婉约正宗，凄清如水。"),
        master_room("姜夔", "姜夔", "quan-song-ci", "清空骚雅，白石道人。"),
        master_room("周邦彦", "周邦彦", "quan-song-ci", "格律精严，词家正宗。"),
        master_room("苏轼·诗", "蘇軾", "quan-song-shi", "诗里的东坡，豁达与日常。"),
        master_room("陆游", "陸游", "quan-song-shi", "示儿与剑南，家国之念。"),
        master_room("王安石", "王安石", "quan-song-shi", "半山诗，瘦硬通神。"),
        master_room("黄庭坚", "黄庭坚", "quan-song-shi", "夺胎换骨，江西诗派。"),
    ]
    masters_tang = [m for m in masters_tang if m["count"] > 0]
    masters_song = [m for m in masters_song if m["count"] > 0]

    era_rooms = [
        {
            "id": "era-xianqin",
            "name": "先秦",
            "era": "先秦",
            "form": "诗",
            "blurb": "诗的源头：风、骚。",
            "why": "先摸清源头，再读后代便有来处。",
            "mode": "bundle",
            "children": ["shijing", "chuci"],
            "count": path_rooms[0]["count"] + path_rooms[1]["count"],
        },
        {
            "id": "era-wei",
            "name": "魏晋",
            "era": "魏晋",
            "form": "诗",
            "blurb": "建安风骨的一角。",
            "why": "短而有力，适合一口气读完。",
            "mode": "anthology",
            "files": ["data/曹操诗集/caocao.json"],
            "count": count_list_file("data/曹操诗集/caocao.json"),
        },
        {
            "id": "era-tang",
            "name": "唐代",
            "era": "唐",
            "form": "诗",
            "blurb": "唐诗的高峰。可先读选本，再进名家，最后入全库。",
            "why": "唐是多数人真正开始爱诗的时代。",
            "mode": "era-hub",
            "entry": ["tang300", "qianjiashi"],
            "masters": [m["id"] for m in masters_tang],
            "corpus": "quan-tang",
            "count": corpora["quan-tang"]["count"],
        },
        {
            "id": "era-wudai",
            "name": "五代",
            "era": "五代",
            "form": "词",
            "blurb": "词体成熟前夜。",
            "why": "从花间到南唐，词开始写心里话。",
            "mode": "bundle",
            "children": ["huajian", "nantang"],
            "count": sum(r["count"] for r in path_rooms if r["id"] in {"huajian", "nantang"}),
        },
        {
            "id": "era-song",
            "name": "宋代",
            "era": "宋",
            "form": "诗词",
            "blurb": "诗与词并盛。词可先读三百首，也可进名家专架。",
            "why": "宋人把日常与哲思都写进了诗词。",
            "mode": "era-hub",
            "entry": ["song300"],
            "masters": [m["id"] for m in masters_song],
            "corpus": "quan-song-ci",
            "corpusAlt": "quan-song-shi",
            "count": corpora["quan-song-ci"]["count"] + corpora["quan-song-shi"]["count"],
        },
        {
            "id": "era-yuan",
            "name": "元代",
            "era": "元",
            "form": "曲",
            "blurb": "曲唱人间，另开一体。",
            "why": "想换一种节奏，来读元曲。",
            "mode": "anthology",
            "files": ["data/元曲/yuanqu.json"],
            "count": count_list_file("data/元曲/yuanqu.json"),
        },
        {
            "id": "era-qing",
            "name": "清代",
            "era": "清",
            "form": "词",
            "blurb": "纳兰一集，清水芙蓉。",
            "why": "清词里最容易先爱上的一位。",
            "mode": "anthology",
            "files": ["data/纳兰性德/纳兰性德诗集.json"],
            "count": count_list_file("data/纳兰性德/纳兰性德诗集.json"),
        },
    ]

    form_rooms = [
        {
            "id": "form-shi",
            "name": "诗",
            "form": "诗",
            "blurb": "从诗经、唐诗到宋诗。",
            "why": "想按「诗」这一体系统读。",
            "mode": "form-hub",
            "entry": ["shijing", "tang300", "qianjiashi"],
            "count": corpora["quan-tang"]["count"] + corpora["quan-song-shi"]["count"],
        },
        {
            "id": "form-ci",
            "name": "词",
            "form": "词",
            "blurb": "花间、南唐、两宋。",
            "why": "长短句另有一套读法。",
            "mode": "form-hub",
            "entry": ["song300", "huajian", "nantang"],
            "count": corpora["quan-song-ci"]["count"],
        },
        {
            "id": "form-qu",
            "name": "曲",
            "form": "曲",
            "blurb": "元曲一库。",
            "why": "诗词语尽处，听曲。",
            "mode": "anthology",
            "files": ["data/元曲/yuanqu.json"],
            "count": count_list_file("data/元曲/yuanqu.json"),
        },
        anthology(
            "shuimo", "水墨唐诗", "唐", "诗",
            "画意诗心的短章。",
            ["data/水墨唐诗/shuimotangshi.json"],
            why="想读得短、读得静。",
        ),
    ]

    books = {}
    for r in path_rooms + era_rooms + masters_tang + masters_song + form_rooms:
        books[r["id"]] = r

    for c in corpora.values():
        books[c["id"]] = {
            "id": c["id"],
            "name": c["name"],
            "era": c["era"],
            "form": c["form"],
            "blurb": f"{c['name']}篇目繁多。可先找名家，或按检索入内，也可随手翻读。",
            "why": "像图书馆的闭架大库：都在，但不建议一进门就整排搬。",
            "mode": "corpus",
            "files": c["files"],
            "count": c["count"],
            "authorIndex": c["authorIndex"],
            "corpus": c["id"],
        }

    floors = [
        {
            "id": "path",
            "name": "入门之路",
            "guide": "像图书馆的「新手上架」：先读选本，建立语感，再进时代与名家。",
            "rooms": [r["id"] for r in path_rooms],
        },
        {
            "id": "era",
            "name": "按时代逛",
            "guide": "一个时代一间阅览室。先看导读，再决定读选本、名家，还是入全库。",
            "rooms": [r["id"] for r in era_rooms],
        },
        {
            "id": "masters",
            "name": "名家专架",
            "guide": "按人读，是最省力的深度学习法。唐与宋分两边架。",
            "sections": [
                {"name": "唐人名家", "rooms": [r["id"] for r in masters_tang]},
                {"name": "宋人名家", "rooms": [r["id"] for r in masters_song]},
            ],
        },
        {
            "id": "form",
            "name": "按体裁",
            "guide": "诗、词、曲路径不同。不知道从哪朝读起时，可先选体裁。",
            "rooms": [r["id"] for r in form_rooms],
        },
    ]

    learning_path = [
        {"step": 1, "title": "先读源头", "book": "shijing", "note": "认识诗从何而来"},
        {"step": 2, "title": "建立语感", "book": "tang300", "note": "每天一首，不求多"},
        {"step": 3, "title": "接触词体", "book": "song300", "note": "体会长短句的转折"},
        {"step": 4, "title": "跟着名家", "book": "master-quan-tang-李白", "note": "专架深读一位诗人"},
        {"step": 5, "title": "按需入全库", "book": "quan-tang", "note": "有了坐标，再进大库不迷路"},
    ]

    library = {
        "title": "中文诗歌",
        "subtitle": "一座可读可学的诗词图书馆",
        "floors": floors,
        "books": books,
        "corpora": {
            k: {
                "id": v["id"],
                "name": v["name"],
                "count": v["count"],
                "authorIndex": v["authorIndex"],
            }
            for k, v in corpora.items()
        },
        "learningPath": learning_path,
        "inventoryNote": "选本与全库会有篇目重叠，如同图书馆里「选本 + 全集」并存，这是正常的。",
    }
    write_json(OUT, library, pretty=True)
    print("floors", len(floors), "books", len(books))
    print("masters tang/song", len(masters_tang), len(masters_song))

    pool = []
    for bid in ["tang300", "qianjiashi", "song300", "shijing", "nantang"]:
        b = books[bid]
        for rel in b.get("files") or []:
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
                        "shelf": b["name"],
                        "source": rel,
                    }
                )
    for item in load_json(DATA / "曹操诗集/caocao.json"):
        pool.append(
            {
                "title": item.get("title") or "无题",
                "author": "曹操",
                "lines": item.get("paragraphs") or [],
                "rhythmic": "",
                "shelf": "曹操诗集",
                "source": "data/曹操诗集/caocao.json",
            }
        )
    write_json(DAILY, pool)
    print("daily", len(pool))


if __name__ == "__main__":
    main()
