#!/usr/bin/env python3
"""Generates all language pages + sitemap.xml + llms.txt + agents.txt.

Run from anywhere:  python _build/build.py
To add a language: add one entry to LANGS (order = order in the switcher), run the script.
The folder starts with "_" so GitHub Pages does not publish it.
"""
import os
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
BASE = "https://clever-play-ua.github.io"
LASTMOD = date.today().isoformat()
NAME = "Clever Play UA"
YT = "https://www.youtube.com/@clever_play_ua"
TG = "https://t.me/clever_play_ua"
IG = "https://www.instagram.com/clever_play_ua/"

# code = folder name ("" for the default language at the site root)
# hl = hreflang / <html lang>, og = og:locale, short/nat = code + native name shown in the language menu
LANGS = [
    dict(code="",   hl="uk",      og="uk_UA", en="Ukrainian",  uk="Українська",
         short="UK", nat="Українська",
         t1="Маленька спілька з великою душею", t2="Перекладаємо та озвучуємо українською",
         dark="Темна тема", light="Світла тема", lang_aria="Мова / Language", social="Соцмережі"),
    dict(code="en", hl="en",      og="en_US", en="English",    uk="Англійська",
         short="EN", nat="English",
         t1="A small community with a big heart", t2="We translate and voice into Ukrainian",
         dark="Dark theme", light="Light theme", lang_aria="Language / Мова", social="Social media"),
    dict(code="zh", hl="zh-Hans", og="zh_CN", en="Chinese",    uk="Китайська",
         short="ZH", nat="中文",
         t1="小小的团队，大大的热情", t2="我们提供乌克兰语翻译与配音",
         dark="深色主题", light="浅色主题", lang_aria="语言 / Language", social="社交媒体"),
    dict(code="es", hl="es",      og="es_ES", en="Spanish",    uk="Іспанська",
         short="ES", nat="Español",
         t1="Una pequeña comunidad con un gran corazón", t2="Traducimos y doblamos al ucraniano",
         dark="Tema oscuro", light="Tema claro", lang_aria="Idioma / Language", social="Redes sociales"),
    dict(code="ar", hl="ar",      og="ar_AR", en="Arabic",     uk="Арабська",
         short="AR", nat="العربية", rtl=True,
         t1="مجتمع صغير بقلب كبير", t2="نترجم وندبلج إلى الأوكرانية",
         dark="المظهر الداكن", light="المظهر الفاتح", lang_aria="اللغة / Language", social="وسائل التواصل الاجتماعي"),
    dict(code="fr", hl="fr",      og="fr_FR", en="French",     uk="Французька",
         short="FR", nat="Français",
         t1="Une petite communauté au grand cœur", t2="Nous traduisons et doublons en ukrainien",
         dark="Thème sombre", light="Thème clair", lang_aria="Langue / Language", social="Réseaux sociaux"),
    dict(code="pt", hl="pt",      og="pt_BR", en="Portuguese", uk="Португальська",
         short="PT", nat="Português",
         t1="Uma pequena comunidade com um grande coração", t2="Traduzimos e dublamos para o ucraniano",
         dark="Tema escuro", light="Tema claro", lang_aria="Idioma / Language", social="Redes sociais"),
    dict(code="id", hl="id",      og="id_ID", en="Indonesian", uk="Індонезійська",
         short="ID", nat="Bahasa Indonesia",
         t1="Komunitas kecil dengan hati yang besar", t2="Kami menerjemahkan dan mengisi suara dalam bahasa Ukraina",
         dark="Tema gelap", light="Tema terang", lang_aria="Bahasa / Language", social="Media sosial"),
    dict(code="de", hl="de",      og="de_DE", en="German",     uk="Німецька",
         short="DE", nat="Deutsch",
         t1="Eine kleine Gemeinschaft mit großem Herz", t2="Wir übersetzen und vertonen auf Ukrainisch",
         dark="Dunkles Design", light="Helles Design", lang_aria="Sprache / Language", social="Soziale Medien"),
    dict(code="ja", hl="ja",      og="ja_JP", en="Japanese",   uk="Японська",
         short="JA", nat="日本語",
         t1="小さくても心の大きなコミュニティ", t2="ウクライナ語への翻訳と吹き替えを行っています",
         dark="ダークテーマ", light="ライトテーマ", lang_aria="言語 / Language", social="SNS"),
    dict(code="vi", hl="vi",      og="vi_VN", en="Vietnamese", uk="В’єтнамська",
         short="VI", nat="Tiếng Việt",
         t1="Một cộng đồng nhỏ với trái tim lớn", t2="Chúng tôi dịch và lồng tiếng sang tiếng Ukraina",
         dark="Giao diện tối", light="Giao diện sáng", lang_aria="Ngôn ngữ / Language", social="Mạng xã hội"),
    dict(code="tr", hl="tr",      og="tr_TR", en="Turkish",    uk="Турецька",
         short="TR", nat="Türkçe",
         t1="Küçük ama kocaman yürekli bir topluluk", t2="Ukraynacaya çeviri ve seslendirme yapıyoruz",
         dark="Koyu tema", light="Açık tema", lang_aria="Dil / Language", social="Sosyal medya"),
    dict(code="ko", hl="ko",      og="ko_KR", en="Korean",     uk="Корейська",
         short="KO", nat="한국어",
         t1="작지만 마음이 큰 커뮤니티", t2="우크라이나어로 번역하고 더빙합니다",
         dark="다크 테마", light="라이트 테마", lang_aria="언어 / Language", social="소셜 미디어"),
    dict(code="it", hl="it",      og="it_IT", en="Italian",    uk="Італійська",
         short="IT", nat="Italiano",
         t1="Una piccola comunità con un grande cuore", t2="Traduciamo e doppiamo in ucraino",
         dark="Tema scuro", light="Tema chiaro", lang_aria="Lingua / Language", social="Social media"),
    dict(code="th", hl="th",      og="th_TH", en="Thai",       uk="Тайська",
         short="TH", nat="ไทย",
         t1="ชุมชนเล็ก ๆ ที่มีหัวใจยิ่งใหญ่", t2="เราแปลและพากย์เสียงเป็นภาษายูเครน",
         dark="ธีมมืด", light="ธีมสว่าง", lang_aria="ภาษา / Language", social="โซเชียลมีเดีย"),
    dict(code="pl", hl="pl",      og="pl_PL", en="Polish",     uk="Польська",
         short="PL", nat="Polski",
         t1="Mała społeczność z wielkim sercem", t2="Tłumaczymy i dubbingujemy na ukraiński",
         dark="Ciemny motyw", light="Jasny motyw", lang_aria="Język / Language", social="Media społecznościowe"),
    dict(code="nl", hl="nl",      og="nl_NL", en="Dutch",      uk="Нідерландська",
         short="NL", nat="Nederlands",
         t1="Een kleine community met een groot hart", t2="Wij vertalen en nasynchroniseren in het Oekraïens",
         dark="Donker thema", light="Licht thema", lang_aria="Taal / Language", social="Sociale media"),
]


PROJECT_TITLE = "The Age of the Ring"
PROJECT_LINK = TG  # TODO: replace with the project's own page/video when it exists
# code -> (section heading, card description, button)
PROJ = {
    "":   ("Наші останні проєкти", "Українська локалізація", "Дізнатися більше"),
    "en": ("Our latest projects", "Ukrainian localization", "Learn more"),
    "zh": ("我们的最新项目", "乌克兰语本地化", "了解更多"),
    "es": ("Nuestros últimos proyectos", "Localización al ucraniano", "Más información"),
    "ar": ("أحدث مشاريعنا", "التوطين باللغة الأوكرانية", "اعرف المزيد"),
    "fr": ("Nos derniers projets", "Localisation en ukrainien", "En savoir plus"),
    "pt": ("Nossos projetos mais recentes", "Localização em ucraniano", "Saiba mais"),
    "id": ("Proyek terbaru kami", "Lokalisasi ke bahasa Ukraina", "Selengkapnya"),
    "de": ("Unsere neuesten Projekte", "Ukrainische Lokalisierung", "Mehr erfahren"),
    "ja": ("最新のプロジェクト", "ウクライナ語ローカライズ", "詳しく見る"),
    "vi": ("Dự án mới nhất của chúng tôi", "Bản địa hóa tiếng Ukraina", "Tìm hiểu thêm"),
    "tr": ("Son projelerimiz", "Ukraynaca yerelleştirme", "Daha fazla bilgi"),
    "ko": ("최근 프로젝트", "우크라이나어 현지화", "자세히 보기"),
    "it": ("I nostri ultimi progetti", "Localizzazione in ucraino", "Scopri di più"),
    "th": ("โปรเจกต์ล่าสุดของเรา", "การแปลเป็นภาษายูเครน", "ดูเพิ่มเติม"),
    "pl": ("Nasze najnowsze projekty", "Ukraińska lokalizacja", "Dowiedz się więcej"),
    "nl": ("Onze nieuwste projecten", "Oekraïense lokalisatie", "Meer info"),
}


def url(l):
    return BASE + "/" + (l["code"] + "/" if l["code"] else "")


def rel(src, dst):
    """Relative href from page `src` to page `dst` (folder URLs)."""
    if src["code"] == dst["code"]:
        return "./"
    if not src["code"]:
        return dst["code"] + "/"
    return "../" + (dst["code"] + "/" if dst["code"] else "")


def page(l):
    pre = "../" if l["code"] else ""
    desc = f'{NAME}: {l["t1"]}. {l["t2"]}.'
    alts = "\n".join(
        f'<link rel="alternate" hreflang="{o["hl"]}" href="{url(o)}">' for o in LANGS
    ) + f'\n<link rel="alternate" hreflang="x-default" href="{url(LANGS[0])}">'
    og_alt = "\n".join(
        f'<meta property="og:locale:alternate" content="{o["og"]}">' for o in LANGS if o is not l
    )
    cur = ' aria-current="page"'
    items = "\n".join(
        f'        <li><a href="{rel(l, o)}" hreflang="{o["hl"]}" lang="{o["hl"]}"{cur if o is l else ""}>'
        f'<span class="code">{o["short"]}</span>{o["nat"]}</a></li>'
        for o in LANGS
    )
    ph, pd, pb = PROJ[l["code"]]
    d = ' dir="rtl"' if l.get("rtl") else ""
    return f'''<!doctype html>
<html lang="{l["hl"]}"{d} data-theme="dark">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{NAME}</title>
<meta name="description" content="{desc}">
<link rel="canonical" href="{url(l)}">
{alts}
<meta name="theme-color" content="#030406">
<link rel="icon" type="image/svg+xml" href="{pre}logo.svg">
<link rel="stylesheet" href="{pre}style.css">
<script>try{{var t=localStorage.getItem('theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}}catch(e){{}}</script>

<meta property="og:type" content="website">
<meta property="og:site_name" content="{NAME}">
<meta property="og:title" content="{NAME}">
<meta property="og:description" content="{l["t1"]}. {l["t2"]}.">
<meta property="og:url" content="{url(l)}">
<meta property="og:locale" content="{l["og"]}">
{og_alt}
<meta name="twitter:card" content="summary">

<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@graph": [
    {{
      "@type": "Organization",
      "@id": "{BASE}/#org",
      "name": "{NAME}",
      "url": "{BASE}/",
      "sameAs": [
        "{YT}",
        "{TG}",
        "{IG}"
      ]
    }},
    {{
      "@type": "WebSite",
      "@id": "{url(l)}#site",
      "url": "{url(l)}",
      "name": "{NAME}",
      "inLanguage": "{l["hl"]}",
      "publisher": {{ "@id": "{BASE}/#org" }}
    }}
  ]
}}
</script>
</head>
<body>
  <div class="bg" aria-hidden="true">
    <div class="grid"></div>
    <div class="glow"></div>
    <div class="vignette"></div>
  </div>

  <div class="bar">
    <details id="lang" class="lang">
      <summary class="ctl" aria-label="{l["lang_aria"]}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><circle cx="12" cy="12" r="9.5"/><ellipse cx="12" cy="12" rx="4" ry="9.5"/><path d="M2.5 12h19"/></svg>
        <span class="lang-code">{l["short"]}</span>
      </summary>
      <ul class="lang-list">
{items}
      </ul>
    </details>
    <button id="theme" class="ctl" type="button" data-dark="{l["dark"]}" data-light="{l["light"]}">{l["light"]}</button>
  </div>

  <main>
    <img class="logo" src="{pre}logo.svg" alt="{NAME}" width="400" height="240">
    <h1 class="title">{NAME}</h1>
    <p class="tagline">{l["t1"]} <span aria-hidden="true">•</span> {l["t2"]}</p>
    <nav class="links" aria-label="{l["social"]}">
      <a href="{YT}" rel="me noopener" target="_blank">YouTube</a>
      <a href="{TG}" rel="me noopener" target="_blank">Telegram</a>
      <a href="{IG}" rel="me noopener" target="_blank">Instagram</a>
    </nav>
  </main>

  <section class="projects">
    <h2>{ph}</h2>
    <div class="card">
      <div class="card-body">
        <h3 class="card-title">{PROJECT_TITLE}</h3>
        <p class="card-desc">{pd}</p>
        <a class="card-btn" href="{PROJECT_LINK}" rel="noopener" target="_blank">{pb}</a>
      </div>
    </div>
  </section>
  <script src="{pre}site.js" defer></script>
</body>
</html>
'''


def write(path, text):
    full = os.path.join(ROOT, path)
    os.makedirs(os.path.dirname(full), exist_ok=True)
    with open(full, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)


def sitemap():
    alt = "\n".join(
        f'    <xhtml:link rel="alternate" hreflang="{o["hl"]}" href="{url(o)}"/>' for o in LANGS
    ) + f'\n    <xhtml:link rel="alternate" hreflang="x-default" href="{url(LANGS[0])}"/>'
    blocks = "\n".join(
        f'  <url>\n    <loc>{url(l)}</loc>\n    <lastmod>{LASTMOD}</lastmod>\n{alt}\n  </url>' for l in LANGS
    )
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
  <!-- Generated by _build/build.py. Every language page lists ALL language versions (including itself). -->
{blocks}
</urlset>
'''


def llms():
    pages = "\n".join(f'- [{l["en"]}]({url(l)}): {l["t1"]}' for l in LANGS)
    return f'''# {NAME}

> {NAME}: a small community with a big heart. We translate and voice into Ukrainian. (Маленька спілька з великою душею. Перекладаємо та озвучуємо українською.)

## Social
- [YouTube]({YT})
- [Telegram]({TG})
- [Instagram]({IG})

## Languages
{pages}
'''


def agents():
    codes = ", ".join(l["hl"] for l in LANGS)
    return f'''# agents.txt: instructions for AI agents
# Site content is open for reading and citation with attribution.

Site: {BASE}/
Summary: {BASE}/llms.txt
Sitemap: {BASE}/sitemap.xml
YouTube: {YT}
Telegram: {TG}
Instagram: {IG}
Languages: {codes}
Default-Language: uk

Allow: /
# No actions on behalf of the user (forms, authentication) are provided on this site.
'''


if __name__ == "__main__":
    for l in LANGS:
        write((l["code"] + "/" if l["code"] else "") + "index.html", page(l))
    write("sitemap.xml", sitemap())
    write("llms.txt", llms())
    write("agents.txt", agents())
    print(f"built {len(LANGS)} pages")
