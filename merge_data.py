#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Сборка data.js из content/<book>/*.json фрагментов — МУЛЬТИ-УЧЕБНИКИ.

Структура:
  content/book11/pXX.json  — учебник 11 класса (Чуприс, 2021)
  content/book10/pXX.json  — учебник 10 класса (Данилов, 2020)
  (позже: content/bookNN/...)

Формат:const SITE_DATA = { books: [ {id, meta, sections:[...]}, ... ] }
"""

import json, io, os, sys

BASE = os.path.dirname(os.path.abspath(__file__))

# — Реестр учебников —
BOOKS = [
    {
        "id": "book11",
        "dir": "book11",
        "meta": {
            "siteTitle": "Обществоведение · 11 класс",
            "siteSubtitle": "конспекты, уроки и тесты",
            "grade": "11 класс",
            "author": "О. И. Чуприс, С. А. Балашенко, Н. П. Денисюк и др.",
            "source": "Учебное пособие «Обществоведение. 11 класс» — Минск: Адукацыя і выхаванне, 2021",
            "heroText": "Конспекты, презентации-уроки и тесты по всем параграфам учебника. Отмечайте пройденное, тренируйте ошибки, следите за прогрессом."
        },
        "order": [
            ("s1", "Раздел I. Становление информационной цивилизации", "I. Информационная цивилизация",
             ["p1", "p2", "p3", "p4", "p5"]),
            ("s2", "Раздел II. Беларусь в мировом сообществе", "II. Беларусь в мире",
             ["p6", "p7", "p8", "p9", "p10"]),
            ("s3", "Раздел III. Правовая система Республики Беларусь", "III. Правовая система РБ",
             ["p11", "p13", "p14", "p15", "p16", "p17", "p18"]),
            ("s4", "Раздел IV. Основные направления внутренней политики белорусского государства", "IV. Внутренняя политика",
             ["p19", "p21", "p22", "p23"]),
        ],
    },
    {
        "id": "book10",
        "dir": "book10",
        "meta": {
            "siteTitle": "Обществоведение · 10 класс",
            "siteSubtitle": "конспекты, уроки и тесты",
            "grade": "10 класс",
            "author": "А. Н. Данилов, Е. А. Полейко, Н. В. Кушнер и др. (под ред. А. Н. Данилова)",
            "source": "Учебное пособие «Обществоведение. 10 класс» — Минск: Адукацыя і выхаванне, 2020",
            "heroText": "Конспекты, презентации-уроки и тесты по всем 23 параграфам учебника 10 класса: общество, политика, экономика, духовная сфера."
        },
        "order": [
            ("t1", "Раздел I. Социальная сфера общества", "I. Социальная сфера",
             ["p1", "p2", "p3", "p4", "p5"]),
            ("t2", "Раздел II. Политическая сфера общества", "II. Политическая сфера",
             ["p6", "p7", "p8", "p9", "p10", "p11"]),
            ("t3", "Раздел III. Экономическая сфера общества", "III. Экономическая сфера",
             ["p12", "p13", "p14", "p15", "p16", "p17", "p18"]),
            ("t4", "Раздел IV. Духовная сфера общества", "IV. Духовная сфера",
             ["p19", "p20", "p21", "p22", "p23"]),
        ],
    },
    {
        "id": "book9",
        "dir": "book9",
        "meta": {
            "siteTitle": "Обществоведение · 9 класс",
            "siteSubtitle": "конспекты, уроки и тесты",
            "grade": "9 класс",
            "author": "А. Н. Данилов и др. (под ред. А. Н. Данилова)",
            "source": "Учебное пособие «Обществоведение. 9 класс» — Минск: Адукацыя і выхаванне",
            "heroText": "Конспекты, презентации-уроки и тесты по всем 22 параграфам учебника 9 класса: человек, общение, государство, культура."
        },
        "order": [
            ("n1", "Раздел I. Человек", "I. Человек",
             ["p1", "p2", "p3", "p4", "p5"]),
            ("n2", "Раздел II. Деятельность, общение, взаимодействие", "II. Общение",
             ["p6", "p7", "p8", "p9", "p10", "p11"]),
            ("n3", "Раздел III. Личность, общество, государство", "III. Государство",
             ["p12", "p13", "p14", "p15", "p16", "p17"]),
            ("n4", "Раздел IV. Человек в мире культуры", "IV. Культура",
             ["p18", "p19", "p20", "p21", "p22"]),
        ],
    },
]

def load_book(book):
    """Читает content/<dir>/*.json и собирает структуру книги.
    Fallback: если content/<dir> нет — legacy content/*.json (11-й класс)."""
    cdir = os.path.join(BASE, "content", book["dir"])
    legacy = False
    if not os.path.isdir(cdir):
        cdir = os.path.join(BASE, "content")
        legacy = True
    paragraphs = {}
    if os.path.isdir(cdir):
        for fn in os.listdir(cdir):
            if not fn.endswith(".json"):
                continue
            path = os.path.join(cdir, fn)
            if os.path.isdir(path):
                continue   # подпапки других книг не трогаем
            with io.open(path, "r", encoding="utf-8") as f:
                data = json.load(f)
            if data.get("id"):
                paragraphs[data["id"]] = data

    sections = []
    loaded = 0
    for sid, title, short, ids in book["order"]:
        sec = {"id": sid, "title": title, "short": short, "paragraphs": []}
        for pid in ids:
            p = paragraphs.get(pid)
            if not p:
                continue   # незаполненный параграф — пропускаем
            sec["paragraphs"].append({
                "id": p["id"], "num": p["num"], "title": p["title"],
                "status": p.get("status", "ready"),
                "conspect": p.get("conspect"),
                "detailed": p.get("detailed", []),
                "slides": p.get("slides", []),
                "test": p.get("test", []),
                "links": p.get("links", []),
            })
            loaded += 1
        sections.append(sec)
    return {"id": book["id"], "meta": book["meta"], "sections": sections}, loaded

def main():
    books = []
    total = 0
    for book in BOOKS:
        b, n = load_book(book)
        books.append(b)
        total += n
        print("book %s: %d paragraphs" % (book["id"], n))

    site = {"books": books}

    out_path = os.path.join(BASE, "data.js")
    with io.open(out_path, "w", encoding="utf-8") as f:
        f.write(u"/* ============================================================\n")
        f.write(u"   DATA.JS — единый источник контента сайта. МУЛЬТИ-УЧЕБНИКИ.\n")
        f.write(u"   Сгенерирован автоматически из content/<book>/*.json (merge_data.py).\n")
        f.write(u"   СХЕМА:\n")
        f.write(u"   SITE_DATA = { books: [ { id, meta, sections: [...] } ] }\n")
        f.write(u"   ПАРАГРАФ: { id, num, title, status,\n")
        f.write(u"     conspect: { intro, theses:[{head,text}], terms:[{term,def}], dates:[{when,what}] },\n")
        f.write(u"     detailed: [ {type:'h'|'p'|'ul'|'mark'|'terms'|'memo', ...} ],\n")
        f.write(u"     slides:  [ {kind:'title'|'repeat'|'content'|'example'|'quiz'|'summary'|'homework', ...} ],\n")
        f.write(u"     test:    [ {q, options:[..], correct, why} ],\n")
        f.write(u"     links:   ['p1', ...] }   // связи для mind-map\n")
        f.write(u"   ============================================================ */\n\n")
        f.write(u"const SITE_DATA = ")
        f.write(json.dumps(site, ensure_ascii=False, indent=2))
        f.write(u";\n")
    print("WROTE %s (%d paragraphs in %d books)" % (out_path, total, len(books)))

if __name__ == "__main__":
    main()
