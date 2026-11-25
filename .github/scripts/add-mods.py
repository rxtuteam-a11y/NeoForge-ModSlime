"""Tải mod từ Modrinth (NeoForge 1.21.1) + thư viện phụ thuộc còn thiếu, bỏ qua mod server đã có.
Kết quả: extra-mods/*.jar, extra-mods/khoa-phien-ban.txt, docs/mods-them.zip"""
import json, os, re, sys, urllib.parse, urllib.request, zipfile, io, hashlib

API = "https://api.modrinth.com/v2"
MC, LOADER = "1.21.1", "neoforge"
HDR = {"User-Agent": "modslime-server/1.0"}

def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HDR), timeout=60) as r:
        return json.load(r)

def mod_ids_in_jar(data):
    ids = set()
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        for name in ("META-INF/neoforge.mods.toml", "META-INF/mods.toml"):
            if name in z.namelist():
                text = z.read(name).decode("utf-8", "replace")
                try:
                    import tomllib
                    ids |= {m.get("modId") for m in tomllib.loads(text).get("mods", []) if m.get("modId")}
                except Exception:
                    # chỉ lấy modId trong các khối [[mods]] (bỏ qua [[dependencies...]])
                    for block in re.split(r"^\s*\[\[", text, flags=re.M):
                        if block.startswith("mods]]"):
                            ids |= set(re.findall(r'modId\s*=\s*"([^"]+)"', block))
    except Exception:
        pass
    return ids

def installed_mod_ids(folder):
    ids = set()
    for f in os.listdir(folder) if os.path.isdir(folder) else []:
        if f.endswith(".jar"):
            ids |= mod_ids_in_jar(open(os.path.join(folder, f), "rb").read())
    return ids

def compatible_version(project_id):
    q = urllib.parse.urlencode({"loaders": json.dumps([LOADER]), "game_versions": json.dumps([MC])})
    vs = get(f"{API}/project/{project_id}/version?{q}")
    if not vs:
        return None
    vs.sort(key=lambda v: v["date_published"], reverse=True)   # mới nhất trước
    rel = [v for v in vs if v["version_type"] == "release"]
    return (rel or vs)[0]

def resolve(name):
    slug = name.strip()
    if re.fullmatch(r"[a-z0-9_\-]+", slug):
        try:
            p = get(f"{API}/project/{slug}")
            v = compatible_version(p["id"])
            if v: return p, v
        except Exception:
            pass
    facets = json.dumps([[f"categories:{LOADER}"], [f"versions:{MC}"], ["project_type:mod"]])
    hits = get(f"{API}/search?" + urllib.parse.urlencode({"query": name, "facets": facets, "limit": 5}))["hits"]
    words = [w for w in re.findall(r"[a-z0-9]+", name.lower()) if w not in ("s",)]
    for h in hits:
        title = re.sub(r"[^a-z0-9]+", " ", h["title"].lower())
        if not all(w in title.split() or w in title.replace(" ", "") for w in words):
            continue   # tên không khớp đủ từ khoá -> không nhận bừa
        v = compatible_version(h["project_id"])
        if v: return get(f"{API}/project/{h['project_id']}"), v
    return None, None

def main():
    wanted = [l.strip() for l in open("extra-mods/danh-sach.txt", encoding="utf-8") if l.strip() and not l.startswith("#")]
    have = installed_mod_ids("mods")
    print(f"Server đang có {len(have)} mod id.")
    out_dir = "extra-mods"; files = {}; client_only = set(); report = []; queue = [(n, None) for n in wanted]; seen = set()
    while queue:
        name, parent = queue.pop(0)
        p, v = resolve(name) if parent is None else (get(f"{API}/project/{name}"), compatible_version(name))
        label = name if parent is None else f"{name} (cần cho {parent})"
        if not p or not v:
            report.append(f"❌ {label}: không có bản cho NeoForge {MC}"); continue
        if p["id"] in seen: continue
        seen.add(p["id"])
        f = next((x for x in v["files"] if x.get("primary")), v["files"][0])
        data = urllib.request.urlopen(urllib.request.Request(f["url"], headers=HDR), timeout=120).read()
        if hashlib.sha1(data).hexdigest() != f["hashes"]["sha1"]:
            report.append(f"❌ {p['title']}: sai checksum, bỏ qua"); continue
        ids = mod_ids_in_jar(data)
        if ids and ids <= have:
            report.append(f"⏭️ {p['title']}: server đã có ({', '.join(sorted(ids))})"); continue
        files[f["filename"]] = data
        have |= ids
        side = ""
        if p.get("server_side") == "unsupported":
            client_only.add(f["filename"]); side = "  [CHỈ máy chơi — không cài lên server]"
        report.append(f"✅ {p['title']} {v['version_number']} -> {f['filename']}" + (f"  [phụ thuộc của {parent}]" if parent else "") + side)
        for d in v.get("dependencies", []):
            if d.get("dependency_type") == "required" and d.get("project_id"):
                queue.append((d["project_id"], p["title"]))
    co_dir = os.path.join(out_dir, "chi-may-choi")
    os.makedirs(co_dir, exist_ok=True)
    for d in (out_dir, co_dir):
        for old in os.listdir(d):
            if old.endswith(".jar"): os.remove(os.path.join(d, old))
    for fn, data in files.items():
        # server chỉ chép extra-mods/*.jar; mod chỉ dành cho máy chơi nằm trong extra-mods/chi-may-choi/
        open(os.path.join(co_dir if fn in client_only else out_dir, fn), "wb").write(data)
    open(os.path.join(out_dir, "khoa-phien-ban.txt"), "w", encoding="utf-8").write("\n".join(report) + "\n")
    os.makedirs("docs", exist_ok=True)
    with zipfile.ZipFile("docs/mods-them.zip", "w", zipfile.ZIP_STORED) as z:
        for fn, data in files.items(): z.writestr(fn, data)
        z.writestr("DOC-TRUOC.txt", "Chép tất cả file .jar trong zip này vào thư mục mods của bộ ModSlime trên máy bạn, rồi mở lại game.\n\n" + "\n".join(report) + "\n")
    print("\n".join(report))
    with open(os.environ.get("GITHUB_STEP_SUMMARY", os.devnull), "a", encoding="utf-8") as s:
        s.write("## Kết quả thêm mod\n" + "\n".join(f"- {r}" for r in report) + "\n")

main()
