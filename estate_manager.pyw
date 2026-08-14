#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Estate Manager — internal admin tool for kocsisagnes.hu
========================================================

Add, edit, reorder and remove property listings without touching any
HTML. The tool edits  v1/data/properties.js  (the single source of truth
the website reads) and copies photos into
v1/assets/properties/<category>/property-N/.

How to run
----------
Double-click this file on Windows (it opens without a console window),
or run:  python estate_manager.pyw

Self-test (no GUI):  python estate_manager.pyw --selftest

Requires only the Python standard library (tkinter).
"""

import json
import re
import shutil
import sys
import webbrowser
from pathlib import Path

BASE = Path(__file__).resolve().parent
V1 = BASE / "v1"
DATA_FILE = V1 / "data" / "properties.js"

HEADER = (
    "/* ============================================================\n"
    "   Property data — single source of truth for the whole site.\n"
    "   Edited by the Estate Manager app (Real Estate/estate_manager.pyw).\n"
    "   The value below must stay strict JSON (double quotes, no\n"
    "   trailing commas) so the app can read and rewrite it.\n"
    "   ============================================================ */\n"
)

# category key -> (list label, asset sub-folder)
CATEGORIES = {
    "for-sale": ("For sale (Eladó)", "for-sale"),
    "for-rent": ("For rent (Kiadó)", "for-rent"),
    "garage":   ("Garages (Teremgarázsok)", "garages"),
    "storage":  ("Storages (Tárolók)", "storages"),
    "spain":    ("Spain (Spanyolország)", "spain"),
}

TYPE_HU = ["Eladó", "Kiadó"]
TYPE_EN = ["For sale", "For rent"]
TYPE_HU_TO_EN = {"Eladó": "For sale", "Kiadó": "For rent"}


# ────────────────────────────────────────────────────────────────
#  Data layer (GUI-free, used by --selftest too)
# ────────────────────────────────────────────────────────────────

def load_data(path=DATA_FILE):
    """Read properties.js and return the parsed dict."""
    text = Path(path).read_text(encoding="utf-8")
    m = re.search(r"window\.ESTATE_DATA\s*=\s*(\{.*\})\s*;\s*$", text, re.DOTALL)
    if not m:
        raise ValueError(f"Could not find ESTATE_DATA JSON payload in {path}")
    return json.loads(m.group(1))


def save_data(data, path=DATA_FILE):
    """Write the dict back as strict JSON wrapped for the browser."""
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    Path(path).write_text(
        HEADER + "window.ESTATE_DATA = " + payload + ";\n",
        encoding="utf-8", newline="\n")


def next_id(props):
    return max((p["id"] for p in props), default=0) + 1


def next_folder(data, cat):
    """First free assets/properties/<sub>/property-N folder (checks disk
    and every folder referenced anywhere in the data)."""
    sub = CATEGORIES[cat][1]
    parent = V1 / "assets" / "properties" / sub
    used = set()
    if parent.is_dir():
        for d in parent.iterdir():
            m = re.fullmatch(r"property-(\d+)", d.name)
            if m:
                used.add(int(m.group(1)))
    for plist in data["categories"].values():
        for p in plist:
            m = re.fullmatch(rf"assets/properties/{re.escape(sub)}/property-(\d+)",
                             p.get("folder", ""))
            if m:
                used.add(int(m.group(1)))
    n = 1
    while n in used:
        n += 1
    return f"assets/properties/{sub}/property-{n}"


def next_image_name(existing_names, src_path):
    """Naming convention: first photo is main.<ext>, then 1.<ext>, 2.<ext>…
    `existing_names` is every name already present or assigned."""
    ext = Path(src_path).suffix.lower().lstrip(".") or "jpg"
    stems = {Path(n).stem for n in existing_names}
    if "main" not in stems:
        return f"main.{ext}"
    n = 1
    nums = [int(s) for s in stems if s.isdigit()]
    if nums:
        n = max(nums) + 1
    return f"{n}.{ext}"


def blank_property(props):
    return {
        "id": next_id(props),
        "featured": 0,
        "room": None,
        "area": "",
        "folder": "",
        "images": [],
        "hu": {"title": "", "loc": "", "price": "", "type": TYPE_HU[0], "desc": ""},
        "en": {"title": "", "loc": "", "price": "", "type": TYPE_EN[0], "desc": ""},
    }


def selftest():
    """Round-trip and helper checks against the live data file (read-only:
    all writes go to a temp copy)."""
    import tempfile

    data = load_data()
    cats = data["categories"]
    assert set(CATEGORIES) == set(cats), (set(CATEGORIES), set(cats))

    with tempfile.TemporaryDirectory() as td:
        tmp = Path(td) / "properties.js"
        save_data(data, tmp)
        assert load_data(tmp) == data, "round-trip mismatch"

    for cat, plist in cats.items():
        for p in plist:
            for key in ("id", "featured", "area", "folder", "images", "hu", "en"):
                assert key in p, (cat, p.get("id"), key)
            for lang in ("hu", "en"):
                for key in ("title", "loc", "price", "type", "desc"):
                    assert key in p[lang], (cat, p["id"], lang, key)
            if cat != "spain":
                folder = V1 / Path(*p["folder"].split("/"))
                assert folder.is_dir(), folder
                for img in p["images"]:
                    assert (folder / img).is_file(), folder / img

    assert next_id(cats["for-sale"]) == max(p["id"] for p in cats["for-sale"]) + 1
    assert next_image_name([], "a/b.JPG") == "main.jpg"
    assert next_image_name(["main.jpg"], "x.png") == "1.png"
    assert next_image_name(["main.jpg", "1.png", "7.jpg"], "x.webp") == "8.webp"
    nf = next_folder(data, "for-sale")
    assert nf.startswith("assets/properties/for-sale/property-"), nf
    assert nf not in {p["folder"] for p in cats["for-sale"]}
    print("selftest OK —", sum(len(v) for v in cats.values()), "properties,",
          "next for-sale folder:", nf)


# ────────────────────────────────────────────────────────────────
#  GUI
# ────────────────────────────────────────────────────────────────

def main():
    import tkinter as tk
    from tkinter import ttk, filedialog, messagebox

    if not DATA_FILE.is_file():
        raise SystemExit(f"Data file not found: {DATA_FILE}")

    data = load_data()

    root = tk.Tk()
    root.title("Estate Manager — kocsisagnes.hu")
    root.geometry("1080x720")
    root.minsize(920, 620)

    style = ttk.Style()
    if "vista" in style.theme_names():
        style.theme_use("vista")

    state = {
        "cat": "for-sale",
        "current": None,     # property dict being edited, or None
        "is_new": False,
        "images": [],        # [{'kind':'existing'|'staged', 'name':..., 'src':...}]
        "deletions": [],     # existing filenames to delete from disk on save
    }

    # ── layout skeleton ─────────────────────────────────────────
    toolbar = ttk.Frame(root, padding=(8, 6))
    toolbar.pack(fill="x")

    paned = ttk.Panedwindow(root, orient="horizontal")
    paned.pack(fill="both", expand=True, padx=8, pady=(0, 2))

    status = tk.StringVar(value=f"Data file: {DATA_FILE}")
    ttk.Label(root, textvariable=status, padding=(10, 4), foreground="#555")\
        .pack(fill="x", side="bottom")

    # ── left: category + property list ──────────────────────────
    left = ttk.Frame(paned, padding=(0, 0, 6, 0))
    paned.add(left, weight=1)

    ttk.Label(left, text="Category").pack(anchor="w")
    cat_var = tk.StringVar(value=CATEGORIES[state["cat"]][0])
    cat_box = ttk.Combobox(left, textvariable=cat_var, state="readonly",
                           values=[label for label, _ in CATEGORIES.values()])
    cat_box.pack(fill="x", pady=(2, 8))

    list_frame = ttk.Frame(left)
    list_frame.pack(fill="both", expand=True)
    prop_list = tk.Listbox(list_frame, activestyle="dotbox", exportselection=False)
    scroll = ttk.Scrollbar(list_frame, command=prop_list.yview)
    prop_list.configure(yscrollcommand=scroll.set)
    prop_list.pack(side="left", fill="both", expand=True)
    scroll.pack(side="right", fill="y")

    order_bar = ttk.Frame(left)
    order_bar.pack(fill="x", pady=(6, 0))
    up_btn = ttk.Button(order_bar, text="▲ Move up", width=12)
    dn_btn = ttk.Button(order_bar, text="▼ Move down", width=12)
    up_btn.pack(side="left")
    dn_btn.pack(side="left", padx=(6, 0))

    # ── right: edit form ─────────────────────────────────────────
    right = ttk.Frame(paned, padding=(6, 0, 0, 0))
    paned.add(right, weight=3)

    common = ttk.Labelframe(right, text="Details", padding=8)
    common.pack(fill="x")

    id_var = tk.StringVar()
    feat_var = tk.StringVar(value="0")
    room_var = tk.StringVar()
    area_var = tk.StringVar()

    ttk.Label(common, text="ID").grid(row=0, column=0, sticky="w")
    ttk.Entry(common, textvariable=id_var, width=6, state="readonly")\
        .grid(row=0, column=1, sticky="w", padx=(4, 16))
    ttk.Label(common, text="Featured order (0 = not featured)")\
        .grid(row=0, column=2, sticky="w")
    ttk.Spinbox(common, textvariable=feat_var, from_=0, to=99, width=5)\
        .grid(row=0, column=3, sticky="w", padx=(4, 16))
    ttk.Label(common, text="Rooms").grid(row=0, column=4, sticky="w")
    ttk.Entry(common, textvariable=room_var, width=6)\
        .grid(row=0, column=5, sticky="w", padx=(4, 16))
    ttk.Label(common, text="Area (e.g. 76 + 24 m²)").grid(row=0, column=6, sticky="w")
    ttk.Entry(common, textvariable=area_var, width=18)\
        .grid(row=0, column=7, sticky="w", padx=4)

    # language tabs
    nb = ttk.Notebook(right)
    nb.pack(fill="both", expand=True, pady=(8, 0))

    lang_vars = {}

    def build_lang_tab(lang, label, type_values):
        tab = ttk.Frame(nb, padding=8)
        nb.add(tab, text=label)
        v = {
            "title": tk.StringVar(),
            "loc": tk.StringVar(),
            "price": tk.StringVar(),
            "type": tk.StringVar(value=type_values[0]),
        }
        ttk.Label(tab, text="Title").grid(row=0, column=0, sticky="w")
        ttk.Entry(tab, textvariable=v["title"]).grid(row=0, column=1, sticky="ew", pady=2)
        ttk.Label(tab, text="Location").grid(row=1, column=0, sticky="w")
        ttk.Entry(tab, textvariable=v["loc"]).grid(row=1, column=1, sticky="ew", pady=2)
        ttk.Label(tab, text="Price (exact display text)").grid(row=2, column=0, sticky="w")
        ttk.Entry(tab, textvariable=v["price"]).grid(row=2, column=1, sticky="ew", pady=2)
        ttk.Label(tab, text="Type (badge)").grid(row=3, column=0, sticky="w")
        ttk.Combobox(tab, textvariable=v["type"], values=type_values, width=16)\
            .grid(row=3, column=1, sticky="w", pady=2)
        ttk.Label(tab, text="Description").grid(row=4, column=0, sticky="nw", pady=(4, 0))
        txt = tk.Text(tab, height=10, wrap="word", undo=True)
        txt.grid(row=4, column=1, sticky="nsew", pady=(4, 0))
        tscroll = ttk.Scrollbar(tab, command=txt.yview)
        txt.configure(yscrollcommand=tscroll.set)
        tscroll.grid(row=4, column=2, sticky="ns", pady=(4, 0))
        tab.columnconfigure(1, weight=1)
        tab.rowconfigure(4, weight=1)
        v["desc"] = txt
        lang_vars[lang] = v
        return tab

    build_lang_tab("hu", "Magyar (HU)", TYPE_HU)
    en_tab = build_lang_tab("en", "English (EN)", TYPE_EN)

    def copy_hu_to_en():
        hu, en = lang_vars["hu"], lang_vars["en"]
        for key in ("title", "loc", "price"):
            en[key].set(hu[key].get())
        en["type"].set(TYPE_HU_TO_EN.get(hu["type"].get(), hu["type"].get()))
        en["desc"].delete("1.0", "end")
        en["desc"].insert("1.0", hu["desc"].get("1.0", "end-1c"))
        status.set("Copied Hungarian fields into the English tab — now translate them.")

    ttk.Button(en_tab, text="⇩ Copy from Hungarian tab (then translate)",
               command=copy_hu_to_en).grid(row=5, column=1, sticky="w", pady=(6, 0))

    # ── images ──────────────────────────────────────────────────
    img_frame = ttk.Labelframe(right, text="Photos (first one is the cover)", padding=8)
    img_frame.pack(fill="x", pady=(8, 0))

    img_list = tk.Listbox(img_frame, height=5, exportselection=False)
    img_list.grid(row=0, column=0, rowspan=5, sticky="nsew")
    img_scroll = ttk.Scrollbar(img_frame, command=img_list.yview)
    img_list.configure(yscrollcommand=img_scroll.set)
    img_scroll.grid(row=0, column=1, rowspan=5, sticky="ns")
    img_frame.columnconfigure(0, weight=1)

    def refresh_img_list(keep=None):
        img_list.delete(0, "end")
        for i, e in enumerate(state["images"]):
            cover = "★ " if i == 0 else "   "
            if e["kind"] == "existing":
                img_list.insert("end", f"{cover}{e['name']}")
            else:
                img_list.insert("end", f"{cover}(new) {Path(e['src']).name}")
        if keep is not None and 0 <= keep < len(state["images"]):
            img_list.selection_set(keep)
            img_list.see(keep)

    def add_photos():
        paths = filedialog.askopenfilenames(
            title="Choose photos (selection order = display order)",
            filetypes=[("Images", "*.jpg *.jpeg *.png *.webp *.jfif *.avif"),
                       ("All files", "*.*")])
        for p in paths:
            state["images"].append({"kind": "staged", "src": p})
        refresh_img_list()

    def remove_photo():
        sel = img_list.curselection()
        if not sel:
            return
        e = state["images"].pop(sel[0])
        if e["kind"] == "existing":
            state["deletions"].append(e["name"])
        refresh_img_list(min(sel[0], len(state["images"]) - 1))

    def move_photo(delta):
        sel = img_list.curselection()
        if not sel:
            return
        i, j = sel[0], sel[0] + delta
        if 0 <= j < len(state["images"]):
            imgs = state["images"]
            imgs[i], imgs[j] = imgs[j], imgs[i]
            refresh_img_list(j)

    ttk.Button(img_frame, text="➕ Add photos…", command=add_photos)\
        .grid(row=0, column=2, sticky="ew", padx=(8, 0))
    ttk.Button(img_frame, text="🗑 Remove", command=remove_photo)\
        .grid(row=1, column=2, sticky="ew", padx=(8, 0), pady=2)
    ttk.Button(img_frame, text="▲ Up", command=lambda: move_photo(-1))\
        .grid(row=2, column=2, sticky="ew", padx=(8, 0))
    ttk.Button(img_frame, text="▼ Down", command=lambda: move_photo(1))\
        .grid(row=3, column=2, sticky="ew", padx=(8, 0), pady=2)

    # ── list handling ───────────────────────────────────────────
    def props():
        return data["categories"][state["cat"]]

    def refresh_prop_list(select_id=None):
        prop_list.delete(0, "end")
        for p in props():
            star = "★ " if p.get("featured") else "   "
            prop_list.insert("end", f"{star}#{p['id']} — {p['hu']['title'] or '(untitled)'}")
        if select_id is not None:
            for i, p in enumerate(props()):
                if p["id"] == select_id:
                    prop_list.selection_set(i)
                    prop_list.see(i)
                    break

    def load_form(p, is_new=False):
        state["current"] = p
        state["is_new"] = is_new
        state["deletions"] = []
        id_var.set(str(p["id"]))
        feat_var.set(str(p.get("featured") or 0))
        room_var.set("" if p.get("room") in (None, "") else str(p["room"]))
        area_var.set(p.get("area") or "")
        for lang in ("hu", "en"):
            v = lang_vars[lang]
            for key in ("title", "loc", "price", "type"):
                v[key].set(p[lang].get(key, ""))
            v["desc"].delete("1.0", "end")
            v["desc"].insert("1.0", p[lang].get("desc", ""))
        state["images"] = [{"kind": "existing", "name": n} for n in p.get("images", [])]
        refresh_img_list()
        status.set(("New property — fill in the form and press Save."
                    if is_new else
                    f"Editing #{p['id']} ({state['cat']}). Changes apply when you press Save."))

    def on_select(_event=None):
        sel = prop_list.curselection()
        if sel:
            load_form(props()[sel[0]])

    prop_list.bind("<<ListboxSelect>>", on_select)

    def on_cat_change(_event=None):
        label = cat_var.get()
        for key, (lbl, _sub) in CATEGORIES.items():
            if lbl == label:
                state["cat"] = key
                break
        state["current"] = None
        refresh_prop_list()
        if props():
            prop_list.selection_set(0)
            on_select()
        else:
            load_form(blank_property(props()), is_new=True)
            status.set(f"No properties in “{label}” yet — the form holds a new one.")

    cat_box.bind("<<ComboboxSelected>>", on_cat_change)

    def move_prop(delta):
        sel = prop_list.curselection()
        if not sel:
            return
        i, j = sel[0], sel[0] + delta
        plist = props()
        if 0 <= j < len(plist):
            plist[i], plist[j] = plist[j], plist[i]
            save_data(data)
            refresh_prop_list(select_id=plist[j]["id"])
            status.set("Order saved — the website lists them in this order.")

    up_btn.configure(command=lambda: move_prop(-1))
    dn_btn.configure(command=lambda: move_prop(1))

    # ── toolbar actions ─────────────────────────────────────────
    def new_property():
        prop_list.selection_clear(0, "end")
        load_form(blank_property(props()), is_new=True)

    def save_property():
        p = state["current"]
        if p is None:
            return
        hu, en = lang_vars["hu"], lang_vars["en"]
        if not hu["title"].get().strip():
            messagebox.showwarning("Missing title", "The Hungarian title is required.")
            return
        if not en["title"].get().strip():
            if not messagebox.askyesno(
                    "English missing",
                    "The English title is empty, so the English site would show "
                    "an empty card.\nSave anyway?"):
                return

        # gather fields
        p["featured"] = int(feat_var.get() or 0)
        room = room_var.get().strip()
        p["room"] = int(room) if room.isdigit() else None
        p["area"] = area_var.get().strip()
        for lang in ("hu", "en"):
            v = lang_vars[lang]
            p[lang] = {
                "title": v["title"].get().strip(),
                "loc": v["loc"].get().strip(),
                "price": v["price"].get().strip(),
                "type": v["type"].get().strip(),
                "desc": v["desc"].get("1.0", "end-1c"),
            }

        # folder + photos
        if not p["folder"]:
            p["folder"] = next_folder(data, state["cat"])
        folder_abs = V1 / Path(*p["folder"].split("/"))
        staged = [e for e in state["images"] if e["kind"] == "staged"]
        if staged:
            folder_abs.mkdir(parents=True, exist_ok=True)
        existing_names = [e["name"] for e in state["images"] if e["kind"] == "existing"]
        assigned = list(existing_names)
        for e in staged:
            name = next_image_name(assigned, e["src"])
            shutil.copy2(e["src"], folder_abs / name)
            e["kind"], e["name"] = "existing", name
            assigned.append(name)
        for name in state["deletions"]:
            try:
                (folder_abs / name).unlink()
            except OSError:
                pass
        state["deletions"] = []
        p["images"] = [e["name"] for e in state["images"]]

        if state["is_new"]:
            props().append(p)
            state["is_new"] = False
        save_data(data)
        refresh_prop_list(select_id=p["id"])
        refresh_img_list()
        status.set(f"Saved #{p['id']} — the site is updated ({DATA_FILE.name} written).")

    def delete_property():
        p = state["current"]
        if p is None or state["is_new"]:
            return
        if not messagebox.askyesno(
                "Delete listing",
                f"Delete “{p['hu']['title']}” (#{p['id']}) from the website?"):
            return
        props().remove(p)
        save_data(data)
        if p["folder"]:
            folder_abs = V1 / Path(*p["folder"].split("/"))
            if folder_abs.is_dir() and messagebox.askyesno(
                    "Delete photos too?",
                    f"Also delete the photo folder?\n{folder_abs}"):
                shutil.rmtree(folder_abs, ignore_errors=True)
        state["current"] = None
        refresh_prop_list()
        if props():
            prop_list.selection_set(0)
            on_select()
        else:
            new_property()
        status.set("Listing deleted.")

    def open_site():
        webbrowser.open((V1 / "hu" / "index.html").as_uri())

    ttk.Button(toolbar, text="➕ New property", command=new_property).pack(side="left")
    ttk.Button(toolbar, text="💾 Save", command=save_property).pack(side="left", padx=(6, 0))
    ttk.Button(toolbar, text="🗑 Delete", command=delete_property).pack(side="left", padx=(6, 0))
    ttk.Separator(toolbar, orient="vertical").pack(side="left", fill="y", padx=10)
    ttk.Button(toolbar, text="🌐 Open website", command=open_site).pack(side="left")
    ttk.Label(toolbar, text="Tip: ★ featured listings appear on the homepage, "
                            "ordered by their featured number.").pack(side="right")

    # keyboard shortcut
    root.bind("<Control-s>", lambda e: save_property())

    refresh_prop_list()
    if props():
        prop_list.selection_set(0)
        on_select()
    root.mainloop()


if __name__ == "__main__":
    if "--selftest" in sys.argv:
        selftest()
    else:
        main()
