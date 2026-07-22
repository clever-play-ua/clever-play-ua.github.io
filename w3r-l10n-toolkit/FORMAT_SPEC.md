# Формат данных проекта (для CLI/Python работы, без анализа интерфейса)

Этот файл существует, чтобы не читать js/*.js заново каждый раз, когда нужно сгенерировать/поправить JSON руками через Python.

## 1. Hash (стабильный ID для отслеживания изменений строки)

```python
import hashlib
hash_ = hashlib.sha256(text.strip().encode('utf-8')).hexdigest()[:10]
```

Источник: `js/keygen.js`. 10 hex-символов (40 бит) — этого достаточно, коллизии не важны на масштабе одной карты.

## 2. Формат EN source JSON (database/enUS/RoA_*_EN.json)

```json
{
  "meta": {
    "campaign": "RoA",
    "act": "A01",
    "map": "M01",
    "source_lang": "enUS",
    "version": "1.01",
    "updated": "2026-07-22"
  },
  "strings": {
    "RoA_A01_M01_VO_S001_001": {
      "hash": "31ea9e03d9",
      "string_number": 4301,
      "type": "VO",
      "unit_id": "SYS",
      "unit_name": "SYSTEM",
      "source": "English text here"
    }
  }
}
```

Правила по полям entry:
- `hash` — всегда есть, считается от `source`.
- `string_number` — int, только если есть STRING NUMBER (не пишем поле, если его нет).
- `type` — категория (VO, SCRN, HEROES, UNITS, BUILDINGS, AFTIFACTS...), если есть.
- `unit_id` / `unit_name` — только если есть UNIT ID/UNIT NAME.
- `source` — сам текст, всегда последний.
- `meta.source_lang` — полный код локали (`enUS`, не `en`).
- `meta.version` — версия `.wts`, из которой собран файл (соответствует папке в `translations/{locale}/{version}/`).
- `meta.updated` — дата последней сборки/проверки (раньше называлось `generated`).
- Имя файла: `{campaign}_{act}_{map}_EN.json`, **без таймстемпа** (актуальность отслеживается через `meta.updated`, а не через имя файла).

## 3. Формат файла перевода (database/{locale}/*.json)

Плоский объект, ключ → переведённая строка. Никакой вложенности, никакого meta.

```json
{
  "RoA_A01_M01_VO_S001_001": "Переклад тут"
}
```

## 4. Структура папок (актуальная)

```
translations/{locale}/{version}/*.wts   — сырые экспорты из World Editor (enUS, frFR, esMX, ptBR, ukUA...)
database/enUS/RoA_*_EN.json             — EN source (эталон/база для сборки остальных языков)
database/{locale}/RoA_*_{locale}.json   — готовые переводы (frFR, ukUA, esMX, ptBR...)
database/manifest.json                  — список актуальных файлов (пока не синхронизирован с новой схемой имён — используется только браузерным JS, который сейчас не трогаем)
```

Важно: `translations/` теперь **не** внутри `database/` — это отдельная папка в корне проекта. `database/enUS/` — просто ещё одна "локаль", на равных с `database/frFR/` и т.д. (EN — не особый случай, кроме того что это единственная папка со schema `meta+strings`, а не плоским `{key: text}`).

Браузерный JS (`js/*.js`, `database/manifest.json`) **не синхронизирован** с этой новой раскладкой — по договорённости сейчас это не трогаем и ориентируемся только на `python_tools/*.py` (CLI).

## 5. Формат .wts (Warcraft III raw string export)

```
STRING <номер>
// необязательный комментарий (Units: xxxx (Name), Field (Field desc))
{
<текст, может быть многострочным>
}

```
Между блоками — пустая строка. Парсить регуляркой:
```python
re.compile(r"STRING (\d+)\s*\n(?://.*\n)?\{\n([\s\S]*?)\n\}")
```

## 6. Форматы CSV из Google Sheets

### 6.1 Новый общий формат (лист "CSW - Localization", таблица GLOBAL/ACT и т.д.)

Заголовок (11 колонок):
```
RELATION,TYPE,UNIT ID,UNIT NAME,EN,UA,ES,PT,FR,VARIABLE,STRING NUMBER
```
- `RELATION` — раздел (GLOBAL, ACT 1 - CINEMATIC, ...).
- `VARIABLE` — готовый ключ (например `RoA_GLOBAL_HEROES_UTL_001`). Если пусто — строка ещё не готова, пропускаем.
- `STRING NUMBER` — либо `STRING 1234` (парсим число regex `\d+`), либо `IN GAME TRANSLATION` (нет соответствия в .wts — брать текст из колонки EN как есть, `string_number` не пишем), либо пусто.
- Языковые колонки (UA/ES/PT/FR) могут быть пустыми — значит перевода ещё нет, файл перевода для этого языка просто не получает этот ключ.

### 6.2 Старый формат VO CSV (7 колонок, использует js/csv-parser.js)
```
STATUS · UNIT · UNIT TRANSLATION · ENGLISH · TRANSLATION · STRING NUMBER · VARIABLE NAME
```

### 6.3 Старый формат Text CSV (6 колонок)
```
STATUS · TYPE · ENGLISH · TRANSLATION · STRING NUMBER · VARIABLE NAME
```

## 7. Кодировка (mojibake fix)

Если текст выглядит как `Ã©`, `Ã¨`, `Ð...` — это UTF-8, один раз неправильно декодированный как Windows-1252/Latin-1, а потом пересохранённый как UTF-8. Фикс:
```python
fixed = text.encode('cp1252', errors='strict').decode('utf-8', errors='strict')
```
Применять точечно (по блокам/ячейкам), не ко всему файлу разом — часть текста может быть уже корректной и сломается при повторном проходе. Если после этого остались "осиротевшие" `Ã` перед пробелом/знаком препинания — это потерянный байт NBSP (0xA0) для буквы `à`, чинится вручную (см. историю чата, разбор `WC2HumanAct1_frFR.wts`).

## 8. Общий пайплайн для новой языковой версии .wts → JSON

1. Прочитать .wts (`STRING <num> {...}`), собрать `{string_number: text}`.
2. Прочитать EN source JSON, взять `{key: string_number}`.
3. Для каждого key взять текст по string_number из wts-словаря.
4. Записать `{key: text}` в файл перевода нужной локали.
5. Проверить: все ли string_number из EN JSON нашлись в wts (0 missing).
