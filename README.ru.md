# IndexLift SEO Auditor - инструкция на русском

Этот репозиторий содержит только один продукт: SEO skill для агентов и Cursor, который умеет запускать crawl-аудит сайта и формировать отчеты отдельно под Google и Yandex.

## Что находится в репозитории

- `.agents/skills/indexlift-seo-auditor/` - сама skill-папка
- `.agents/skills/indexlift-seo-auditor/SKILL.md` - описание skill для агента
- `.agents/skills/indexlift-seo-auditor/scripts/run-audit.js` - точка запуска аудита
- `.agents/skills/indexlift-seo-auditor/scripts/lib/` - встроенный runtime: crawler, parser, checks, scoring, reporters
- `.agents/skills/indexlift-seo-auditor/references/` - справка по установке и списку проверок

## Схема работы репозитория

```text
Пользователь / агент
        |
        v
SKILL.md
описывает, когда и как использовать skill
        |
        v
scripts/run-audit.js
принимает параметры запуска:
--url --tier --engines --output
        |
        v
scripts/lib/index.js
оркестрирует весь аудит
        |
        +--> crawler.js
        |    загружает robots.txt, sitemap, HTML-страницы и внутренние ссылки
        |
        +--> parsers/html-parser.js
        |    вытаскивает title, description, headings, links, images, schema
        |
        +--> checks/
        |    technical.js
        |    on-page.js
        |    google.js
        |    yandex.js
        |    performance.js
        |    создают SEO findings
        |
        +--> scoring.js
        |    считает баллы и итоговую оценку
        |
        +--> reporters/
             markdown.js и json.js
             собирают финальные отчеты
        |
        v
deliverables/
готовые файлы:
- seo-audit-*.md
- seo-audit-*.json
```

## Как это работает по шагам

1. Агент или пользователь запускает `scripts/run-audit.js`.
2. Скрипт принимает URL сайта, глубину обхода, tier и список движков.
3. Встроенный crawler делает обход стартовой страницы, `robots.txt`, sitemap и внутренних ссылок.
4. HTML parser разбирает страницы и извлекает SEO-данные.
5. Набор проверок строит findings:
   - технические проблемы
   - on-page проблемы
   - сигналы для Google
   - сигналы для Yandex
   - легкие performance-сигналы
6. Scoring engine считает баллы по категориям и общий score.
7. Reporters создают два результата:
   - Markdown-отчет для чтения человеком
   - JSON-артефакт для последующей обработки агентом

## Структура логики внутри skill

```text
run-audit.js
  -> lib/index.js
     -> crawler.js
     -> parsers/html-parser.js
     -> checks/*.js
     -> scoring.js
     -> reporters/*.js
```

## Как установить в Cursor

Есть два варианта.

### Вариант 1. Открыть весь репозиторий

1. Клонируй репозиторий.
2. Открой его в Cursor.
3. Cursor увидит skill в `.agents/skills/indexlift-seo-auditor/`.

### Вариант 2. Скопировать только skill

Можно скопировать только папку:

```text
.agents/skills/indexlift-seo-auditor/
```

в:

```text
~/.cursor/skills/indexlift-seo-auditor/
```

Так как runtime уже встроен внутрь skill, отдельный `src/` не нужен.

## Как запустить аудит вручную

Перейди в папку skill:

```bash
cd .agents/skills/indexlift-seo-auditor
```

Установи зависимости:

```bash
npm install
```

Запусти аудит:

```bash
node scripts/run-audit.js --url "https://example.com" --tier standard --engines google,yandex --output ./deliverables/
```

## Аргументы запуска

- `--url` - адрес сайта для аудита
- `--tier` - режим глубины аудита: `basic`, `standard`, `pro`
- `--engines` - список движков, например `google,yandex`
- `--output` - папка, куда будут сохранены результаты
- `--max-pages` - лимит страниц для обхода
- `--max-depth` - глубина обхода

## Что создается на выходе

После запуска skill сохраняет:

- `seo-audit-<site>-<date>.md` - человекочитаемый SEO-отчет
- `seo-audit-<site>-<date>.json` - структурированный JSON с findings, score и деталями crawl

## Что именно проверяет skill

- Техническое SEO: HTTPS, robots, sitemaps, redirects, canonicals, indexability
- On-page SEO: title, description, H1, headings, alt, internal links
- Google SEO: canonical alignment, hreflang, JSON-LD, viewport, structured data
- Yandex SEO: robots, sitemap, canonical consistency, micro-markup, document size
- Performance: скорость ответа HTML, размер HTML, resource pressure

## Когда использовать этот репозиторий

Используй его, если нужно:

- провести SEO-аудит сайта
- проверить технические SEO-ошибки
- получить отдельные findings под Google и Yandex
- отдать агенту готовый JSON и Markdown результат

## Важно

- Это не агентская платформа.
- Это не dashboard.
- Это не SERP scraper.
- Это только self-contained skill со встроенными скриптами аудита.
