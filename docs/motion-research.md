# Движение в интерфейсе: ресерч (ноябрь 2026)

База для системы движения Reelette. Собрано из открытого кода и статей design-engineering-сообщества, токенов дизайн-систем и живого CSS продуктов (скачан 26.11.2026, значения могут смениться при их деплое).

## Что делают лучшие продукты

- **Linear**: hover основной кнопки — `filter: brightness(115%)`, нажатие — `brightness(98%)` + `scale(.97)`, 160 мс `cubic-bezier(.25,.46,.45,.94)`. Вторичные кнопки меняют только фон и цвет за 160 мс, фон при hover — 5% белого. Меню: opacity + `scale(.98)` за 80 мс, закрытие 60 мс, растёт от кнопки. Подсветка пункта меню включается мгновенно.
- **Raycast**: кнопка `background .2s, box-shadow .2s, transform .1s`; hover тёмной кнопки — только кольцо `0 0 0 1px #ffffff80`. Пружины через CSS `linear()`.
- **Stripe**: `background-color .3s cubic-bezier(.25,1,.5,1)`; стрелка в кнопке появляется из `translateX(-3px)` за 300 мс, уходит за 150, только под `(hover: hover)`.
- **apple.com, глобальное меню**: пункты — opacity + `translateY(-4px)` за 320 мс `cubic-bezier(.4,0,.6,1)`, каскад 20 мс на пункт; закрытие короче и в обратном порядке.
- **Sonner (тосты, Emil Kowalski)**: transform/opacity/height 400 мс `ease`, удаление 200 мс; на transitions, а не keyframes — частые тосты не дёргаются. **Vaul (шторка)**: 500 мс `cubic-bezier(.32,.72,0,1)`.
- **Vercel Web Interface Guidelines**: только transform и opacity, никогда `transition: all`; анимации прерываемы; transform-origin — откуда элемент появляется; спиннер с задержкой 150–300 мс.
- **Family (benji.org)**: каждый переход связывает «было» и «стало»; чем реже действие, тем больше в нём выразительности.
- **Jakub Krehel**: выход мягче входа (opacity + `blur(4px)` + небольшой сдвиг); hover в тёмной теме — кольцо `rgba(255,255,255,.08 → .12)`.

## Общие принципы

1. Hover меняет тон, а не двигает элемент: фон +3–5% белого, `brightness(1.1–1.15)` или кольцо, 100–200 мс, кривая `ease`. Только под `@media (hover: hover) and (pointer: fine)`.
2. Нажатие — `scale(.97)` за 100–160 мс ease-out.
3. Появление — opacity + маленький сдвиг (4–8 px) или масштаб 0.95–0.98, от точки вызова; не из `scale(0)`.
4. Исчезновение быстрее появления на 50–100 мс (Atlassian, Material: 225 → 195).
5. UI-анимации короче 300 мс; модалки, шторки и тосты — до 400–500.
6. Ease-out на всё, что появляется и отвечает на действие; ease-in-out — на то, что остаётся на экране и двигается; ease-in в UI не использовать.
7. Чем чаще действие, тем меньше движения: то, что делают сотни раз за вечер, — почти без анимации.
8. Анимировать только transform и opacity; свойства перечислять явно.
9. Прерываемость: transitions (и пружины), а не keyframes.
10. `prefers-reduced-motion`: убрать сдвиги и масштаб, оставить короткий fade.

## Анти-паттерны

- Движущийся hover на частых кнопках (заливка полосой, сдвиги, вспышки): изображает прогресс, которого нет, отклик запаздывает, при быстром уходе курсора дёргается. Заливка полосой уместна только как прогресс удержания (hold-to-delete).
- Анимации UI дольше 300 мс (NN/g: на 500 мс «начинают тянуться»).
- Появление из `scale(0)`, ease-in, `transform-origin: center` у меню.
- `transition: all`, анимация width/height/top/left.
- Анимации, которые нельзя прервать.

## Токены (сводная таблица)

| Категория | Вход | Выход | Кривая |
|---|---|---|---|
| Hover (фон, цвет, кольцо) | 150 | 150 | `ease` |
| Нажатие (`scale(.97)`) | 100–160 | 100–160 | `cubic-bezier(.23,1,.32,1)` |
| Тултип | 125–150 | 100 | `cubic-bezier(.23,1,.32,1)` |
| Меню, поповер | 150–200 | 100–150 | `cubic-bezier(.23,1,.32,1)` |
| Тост | 300–400 | 200 | `ease` |
| Панель, шторка | 400–500 | 250–300 | `cubic-bezier(.32,.72,0,1)` |
| Модалка (scale .95 → 1 + fade) | 250–300 | 200 | `cubic-bezier(.23,1,.32,1)` |
| Смена контента (crossfade) | 200–250 | 120–150 | ease-out |
| Перестройка списка, высота | 250–300 | — | `cubic-bezier(.77,0,.175,1)` или `(.2,0,0,1)` |
| Каскад (stagger) | шаг 30–50, вся цепочка ≤ 500 | — | как у элемента |
| Большие сцены | 500–700 | 300 | пружина |

Пружины в CSS (форма не зависит от длительности, посчитано по формуле Apple, mass 1):
```css
--spring-snappy: linear(0, 0.026 3%, 0.098 6.3%, 0.185 9.3%, 0.515 19.7%, 0.69 26.3%, 0.812 32.7%, 0.902 39.7%, 0.965 48.3%, 0.997 58.7%, 1.006 72.3%, 1); /* bounce .15, ~640 мс */
--spring-bouncy: linear(0, 0.028 2.7%, 0.109 5.7%, 0.222 8.7%, 0.583 17.3%, 0.776 23%, 0.911 28.7%, 0.996 34.7%, 1.034 40.3%, 1.046 47%, 1.004 75.7%, 1); /* bounce .3, ~745 мс */
```
`linear()`: Chrome/Edge 113, Firefox 112, Safari 17.2.

## Техники на чистом CSS/JS

- **Появление из `display: none`**: `@starting-style` (Chrome/Edge 117, Safari 17.5, Firefox 129) — правило ставить после основного. Исчезновение надёжно во всех браузерах — маленький помощник `hide()`: ставит `data-closing`, ждёт окончания перехода (с потолком по времени) и только потом `hidden`. Чисто CSS-выход через `transition-behavior: allow-discrete` + `display` — только Chrome и Safari 18, в Firefox нет.
- **Popover и `<dialog>`**: вход/выход через `@starting-style` + `overlay`/`display` `allow-discrete`; `overlay` есть только в Chromium — в Safari/Firefox выход может оборваться.
- **Высота до auto**: `interpolate-size: allow-keywords` — только Chrome 129+; везде работает `grid-template-rows: 0fr → 1fr` (уже используется в группах списка). Не дольше ~200 мс: каждый кадр — пересчёт раскладки.
- **Перестановка строк**: FLIP через `element.animate` (сначала все замеры, потом все анимации), 250 мс ease-out. View Transitions дороже: снимки, замороженная страница на время колбэка, `backdrop-filter` пропадает в снимках WebKit и старого Firefox.
- **Цена**: transform и opacity — композитор; box-shadow, filter, background-position — перерисовка; height/width/padding — раскладка. `backdrop-filter` дороже всего. Предок с `opacity < 1`, `filter`, `mask`, `will-change` на них отрезает стеклу фон (Backdrop Root) — плавно показывать само стекло, а не его обёртку. `will-change` — только на время анимации.
- **`innerHTML`** пересоздаёт узлы: `@starting-style` на них переигрывает вход при каждой перерисовке — вешать только на переключаемые контейнеры.

## Источники

- Emil Kowalski: [STANDARDS.md](https://github.com/emilkowalski/skills/blob/main/skills/review-animations/STANDARDS.md), [emil-design-eng](https://github.com/emilkowalski/skills/blob/main/skills/emil-design-eng/SKILL.md), [Great animations](https://emilkowal.ski/ui/great-animations), [You don't need animations](https://emilkowal.ski/ui/you-dont-need-animations), [Sonner styles.css](https://github.com/emilkowalski/sonner/blob/main/src/styles.css), [Vaul constants](https://github.com/emilkowalski/vaul/blob/main/src/constants.ts)
- [Vercel Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines), [Rauno — Invisible Details](https://rauno.me/craft/interaction-design), [benji.org/family-values](https://benji.org/family-values), [Jakub Krehel](https://jakub.kr/writing/details-that-make-interfaces-feel-better), [NN/g Animation duration](https://www.nngroup.com/articles/animation-duration/)
- Material: [Compose MotionTokens](https://raw.githubusercontent.com/androidx/androidx/androidx-main/compose/material3/material3/src/commonMain/kotlin/androidx/compose/material3/tokens/MotionTokens.kt), [M1 duration & easing](https://m1.material.io/motion/duration-easing.html); [Carbon motion](https://carbondesignsystem.com/elements/motion/overview/); Fluent [durations](https://github.com/microsoft/fluentui/blob/master/packages/tokens/src/global/durations.ts) / [curves](https://github.com/microsoft/fluentui/blob/master/packages/tokens/src/global/curves.ts); [Atlassian motion](https://atlassian.design/foundations/motion); [Polaris motion](https://github.com/Shopify/polaris/blob/main/polaris-tokens/src/themes/base/motion.ts); Primer [easing](https://github.com/primer/primitives/blob/main/src/tokens/base/motion/easing.json5); Apple [HIG Motion](https://developer.apple.com/design/human-interface-guidelines/motion), [WWDC23 Animate with springs](https://developer.apple.com/videos/play/wwdc2023/10158/)
- Техники: [Chrome: entry/exit animations](https://developer.chrome.com/blog/entry-exit-animations), [MDN @starting-style](https://developer.mozilla.org/en-US/docs/Web/CSS/@starting-style), [Chrome: animate to height auto](https://developer.chrome.com/docs/css-ui/animate-to-height-auto), [Chrome: same-document view transitions](https://developer.chrome.com/docs/web-platform/view-transitions/same-document), [web.dev animations guide](https://web.dev/articles/animations-guide), [Chrome linear()](https://developer.chrome.com/docs/css-ui/css-linear-easing-function), [web.dev prefers-reduced-motion](https://web.dev/articles/prefers-reduced-motion)
