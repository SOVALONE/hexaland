// Hexaland — мови інтерфейсу (українська / čeština).
// Ключ перекладу — сам український текст (як у gettext): tr("Твій хід!") → "Tvůj tah!".
// • tr(text, vars) — переклад із підстановкою {n}, {a}…
// • Статичний HTML перекладається сам: текстові вузли, placeholder/title/aria-label і елементи з data-th (весь innerHTML).
// • Рушій хоста шле назви режимів, спецкарт і помилки українською — кожен пристрій перекладає їх своєю мовою.
// Мова: вибір користувача (localStorage) або мова пристрою (cs/sk → чеська, інакше українська).
(function (g) {
  "use strict";
  const KEY = "hexaland-lang";
  const LANGS = { uk: "UA", cs: "CZ" };

  const CS = {
    // ---------- головна
    "Hexaland — гра на сотах для компанії": "Hexaland — hra na šestiúhelnících pro partu",
    "Клади карти з лініями, веди свою фішку і не вилети за край поля.<br>Від 2 до 8 гравців, через інтернет, без реєстрації.":
      "Pokládej karty s čarami, veď svou figurku a nevyleť z plochy.<br>Pro 2 až 8 hráčů, přes internet, bez registrace.",
    "ДЛЯ ЦЬОГО ЕКРАНА": "PRO TUTO OBRAZOVKU",
    "Стіл на цьому екрані": "Stůl na této obrazovce",
    "Поле — на комп'ютері чи телевізорі. Гравці сканують QR-код і грають зі своїх телефонів.":
      "Plocha je na počítači nebo televizi. Hráči naskenují QR kód a hrají ze svých telefonů.",
    "Гра лише на телефонах": "Hra jen na telefonech",
    "Створи кімнату на своєму телефоні й надішли друзям посилання. Кожен бачить усе поле у себе.":
      "Vytvoř místnost na svém telefonu a pošli kamarádům odkaz. Každý vidí celou plochu u sebe.",
    "Маєш код кімнати?": "Máš kód místnosti?",
    "Введи код, який показує стіл або хост гри.": "Zadej kód, který ukazuje stůl nebo hostitel hry.",
    "КОД": "KÓD",
    "Увійти": "Vstoupit",
    "Як грати": "Jak hrát",
    "У кожного 3 карти з лініями. Клади карту перед своєю фішкою — і фішка поїде по лінії.":
      "Každý má 3 karty s čarami. Polož kartu před svou figurku — a figurka pojede po čáře.",
    "Хто вилетів за край поля — вибуває. Дві фішки зіткнулись — вибувають обидві.":
      "Kdo vyletí z plochy, vypadává. Když se srazí dvě figurky, vypadnou obě.",
    "Перемагає той, хто залишився останнім. Є ще <b>командна</b> гра і гра <b>на очки</b>.":
      "Vyhrává ten, kdo zůstane poslední. Je i <b>týmová</b> hra a hra <b>na body</b>.",
    "Спецкарти: ⚡ ще хід, 🔄 обмін, ↩️ відбивач, 🌀 телепорт та інші.":
      "Speciální karty: ⚡ tah navíc, 🔄 výměna, ↩️ odrážeč, 🌀 teleport a další.",
    "Хто зайде під час гри — дивиться як <b>глядач</b> і грає з наступної партії.":
      "Kdo přijde během hry, dívá se jako <b>divák</b> a hraje od příští partie.",
    "Пристрій, який створив кімнату, і є «сервером»: не закривай на ньому вкладку, поки йде гра.":
      "Zařízení, které vytvořilo místnost, je „server“: nezavírej na něm kartu, dokud hra běží.",
    "Hexaland · гра працює прямо в браузері": "Hexaland · hra běží přímo v prohlížeči",
    "Код має бути з 5 символів": "Kód má 5 znaků",
    "↩ Повернутися до своєї кімнати {a} ({b} гравц.)": "↩ Vrátit se do své místnosti {a} (hráčů: {b})",

    // ---------- хост
    "Hexaland — кімната": "Hexaland — místnost",
    "← На головну": "← Na hlavní stránku",
    "Кімната {n} уже відкрита на іншому пристрої або вкладці.": "Místnost {n} je už otevřená na jiném zařízení nebo kartě.",
    "Не вдалося запустити кімнату.": "Místnost se nepodařilo spustit.",
    "Цей браузер не підтримує WebRTC": "Tento prohlížeč nepodporuje WebRTC",
    "Це може зробити лише хост": "To může udělat jen hostitel",
    "Немає зв'язку з хостом гри": "Není spojení s hostitelem hry",
    "Хост не відповідає": "Hostitel neodpovídá",

    // ---------- телефон
    "Твоє ім'я": "Tvoje jméno",
    "Напр. Сова": "Např. Sova",
    "Колір фішки": "Barva figurky",
    "Підключитися": "Připojit se",
    "Ти за столом. Чекаємо старту": "Jsi u stolu. Čekáme na start",
    "Змінити": "Změnit",
    "Вийти": "Odejít",
    "👑 Ти хост кімнати": "👑 Jsi hostitel místnosti",
    "Режим": "Režim",
    "Розмір поля": "Velikost plochy",
    "Таймер ходу": "Časovač tahu",
    "Спецкарти": "Speciální karty",
    "СТАРТ": "START",
    "Код кімнати": "Kód místnosti",
    "Покажи QR або надішли друзям посилання": "Ukaž QR kód nebo pošli kamarádům odkaz",
    "📤 Поділитися": "📤 Sdílet",
    "📋 Копіювати": "📋 Kopírovat",
    "За столом": "U stolu",
    "🤖 Додати бота": "🤖 Přidat bota",
    "Кинути кубик": "Hodit kostkou",
    "Кидки": "Hody",
    "🎲 Кинути за тих, хто не кинув": "🎲 Hodit za ty, kdo neházeli",
    "🗺 Усе поле": "🗺 Celá plocha",
    "🎯 Зблизька": "🎯 Zblízka",
    "Повернути проти годинникової": "Otočit proti směru hodin",
    "Повернути за годинниковою": "Otočit po směru hodin",
    "Покласти": "Položit",
    "Твої карти": "Tvoje karty",
    "↻ Ще раз": "↻ Znovu",
    "← У лобі (гравці й налаштування)": "← Do lobby (hráči a nastavení)",
    "Гравці": "Hráči",
    "Кімнату не знайдено": "Místnost nenalezena",
    "Перевір код. Можливо, хост закрив вкладку або ще не відкрив кімнату.":
      "Zkontroluj kód. Možná hostitel zavřel kartu nebo místnost ještě neotevřel.",
    "з'єднання…": "připojování…",
    "Меню хоста": "Menu hostitele",
    "↻ Нова гра (ті самі гравці)": "↻ Nová hra (stejní hráči)",
    "← Назад у лобі": "← Zpět do lobby",
    "📤 Поділитися кімнатою": "📤 Sdílet místnost",
    "{n} с": "{n} s",
    "● кімната {r} відкрита": "● místnost {r} je otevřená",
    "○ відкриваємо кімнату…": "○ otevíráme místnost…",
    "○ немає інтернету — перепідключення…": "○ není internet — připojuji znovu…",
    "● на зв'язку · кімната {r}": "● připojeno · místnost {r}",
    "○ хост кімнати {r} не відповідає…": "○ hostitel místnosti {r} neodpovídá…",
    "○ перепідключення…": "○ připojuji znovu…",
    " · 🔆 екран не згасне": " · 🔆 obrazovka nezhasne",
    "Немає коду кімнати": "Chybí kód místnosti",
    "Відкрий посилання-запрошення або введи код на головній.": "Otevři odkaz s pozvánkou nebo zadej kód na hlavní stránce.",
    "Браузер не підтримує гру": "Prohlížeč hru nepodporuje",
    "Спробуй Chrome, Safari або Firefox останньої версії.": "Zkus nejnovější Chrome, Safari nebo Firefox.",
    "Помилка": "Chyba",
    "Введи ім'я": "Zadej jméno",
    "Вибери колір": "Vyber barvu",
    "{s} поле": "{s} plocha",
    "⏱ {n} с на хід": "⏱ {n} s na tah",
    "∞ без таймера": "∞ bez časovače",
    "Налаштуй гру нижче, поділись кімнатою й натисни «СТАРТ»": "Nastav hru níže, sdílej místnost a stiskni „START“",
    "Ти за столом. Чекаємо, поки на столі натиснуть «Старт»": "Jsi u stolu. Čekáme, až na stole stisknou „Start“",
    "Ти в кімнаті. Чекаємо, поки хост натисне «Старт»": "Jsi v místnosti. Čekáme, až hostitel stiskne „Start“",
    "офлайн": "offline",
    "Прибрати": "Odebrat",
    " (ти)": " (ty)",
    "Ти ходиш першим! 🎉": "Jdeš první! 🎉",
    "Першим ходить {n}": "První jde {n}",
    "Гра починається…": "Hra začíná…",
    "Нічия! Перекинь кубик": "Remíza! Hoď znovu",
    "Хто ходить першим?": "Kdo půjde první?",
    "У вас однаково по {n}": "Máte stejně, po {n}",
    "Натисни на кубик або на кнопку": "Klepni na kostku nebo na tlačítko",
    "Ти викинув {n}": "Hodil(a) jsi {n}",
    "Чекаємо, поки кинуть інші…": "Čekáme, až hodí ostatní…",
    "Перекидають: {n}": "Znovu hází: {n}",
    "Кидаємо…": "Házíme…",
    "кидає…": "hází…",
    " — перший": " — první",
    "👀 Ти глядач": "👀 Jsi divák",
    "Гра вже йде — зіграєш у наступній партії": "Hra už běží — zahraješ si v příští partii",
    " · ходить {n}": " · na tahu je {n}",
    "Твоя команда перемогла! 🏆": "Tvůj tým vyhrál! 🏆",
    "Перемогла команда {n}": "Vyhrál tým {n}",
    "Нічия!": "Remíza!",
    "Ти переміг! 🏆": "Vyhrál(a) jsi! 🏆",
    "Гру завершено": "Hra skončila",
    "У тебе найбільше очок.": "Máš nejvíc bodů.",
    "Ти залишився на полі останнім.": "Zůstal(a) jsi na ploše poslední.",
    "Ділять перемогу: {n}": "O vítězství se dělí: {n}",
    "Переміг: {n}": "Vyhrál(a): {n}",
    "Нічия — ніхто не вижив.": "Remíza — nikdo nepřežil.",
    " · Чекаємо, поки хост почне нову гру": " · Čekáme, až hostitel začne novou hru",
    "Тебе вибито 💥": "Vypadl(a) jsi 💥",
    "Дивись, як грають інші": "Sleduj, jak hrají ostatní",
    "ходить": "na tahu",
    "у грі": "ve hře",
    "вибув": "vypadl(a)",
    "Гравці · 👀 глядачів: {n}": "Hráči · 👀 diváků: {n}",
    "Твій хід!": "Tvůj tah!",
    "Хід: {n}": "Na tahu: {n}",
    "⭐ Твої очки: <b>{n}</b>": "⭐ Tvoje body: <b>{n}</b>",
    "Команда: <b>{n}</b>": "Tým: <b>{n}</b>",
    "🔄 {n} обміняв(ла)ся з тобою картами!": "🔄 {n} si s tebou vyměnil(a) karty!",
    "🦝 {n} поцупив(ла) твою карту!": "🦝 {n} ti ukradl(a) kartu!",
    "🌀 Вилетиш, але телепорт врятує": "🌀 Vyletíš, ale teleport tě zachrání",
    "⚠ Так ти вилетиш за край поля": "⚠ Takhle vyletíš z plochy",
    "⚠ Зіткнешся з {n} — вибудете обоє": "⚠ Srazíš se s hráčem {n} — vypadnete oba",
    "🤝 Зустрінеш союзника {n} — це безпечно": "🤝 Potkáš spojence {n} — to je bezpečné",
    "Пройдеш через {n} карти": "Projdeš přes {n} karty",
    "Натисни на карту, щоб повернути": "Klepni na kartu a otoč ji",
    "Чекай свого ходу": "Počkej na svůj tah",
    "у колоді: {n}": "v balíčku: {n}",
    "Зберегти": "Uložit",
    "Далі →": "Dál →",
    "Увійти в гру": "Vstoupit do hry",
    "Гра вже йде — зачекай наступної": "Hra už běží — počkej na další",
    "⏱ Час вийшов — {n}: випадкова карта": "⏱ Čas vypršel — {n}: náhodná karta",
    "⚡ {n} ходить ще раз": "⚡ {n} hraje ještě jednou",
    "🔄 {a} міняється картами з {b}": "🔄 {a} si vyměňuje karty s hráčem {b}",
    "🦝 {a} поцупив карту в {b}": "🦝 {a} ukradl(a) kartu hráči {b}",
    "⏸️ {n} пропускає хід": "⏸️ {n} vynechává tah",
    "🌀 {n} телепортується": "🌀 {n} se teleportuje",
    "💥 Вибув: {n}": "💥 Vypadl(a): {n}",
    "📋 Посилання скопійовано": "📋 Odkaz zkopírován",
    "Скопіюй посилання:": "Zkopíruj odkaz:",
    "Заходь у Hexaland! Код кімнати: {n}": "Pojď hrát Hexaland! Kód místnosti: {n}",
    "{n} сот": "{n} polí",
    "Без": "Bez",
    "Потрібно щонайменше {a} гравці (зараз {b}). Поділись кімнатою або додай бота":
      "Jsou potřeba aspoň {a} hráči (teď {b}). Sdílej místnost nebo přidej bota",
    "У кожній команді має бути хоча б один гравець": "V každém týmu musí být aspoň jeden hráč",
    "Гравців: {a} з {b}": "Hráčů: {a} z {b}",
    "Почати нову гру з тими самими гравцями? Поточна партія завершиться.": "Začít novou hru se stejnými hráči? Aktuální partie skončí.",
    "Повернутися в лобі? Поточна партія завершиться.": "Vrátit se do lobby? Aktuální partie skončí.",
    "👑 Ти створюєш кімнату {n}. Введи своє ім'я": "👑 Vytváříš místnost {n}. Zadej své jméno",
    "Кімната {n}": "Místnost {n}",

    // ---------- стіл
    "Hexaland — стіл": "Hexaland — stůl",
    "Скануй QR камерою телефона": "Naskenuj QR kód fotoaparátem telefonu",
    "або відкрий сайт і введи код кімнати:": "nebo otevři web a zadej kód místnosti:",
    "Основні": "Základní",
    "Додаткові": "Doplňkové",
    "Кинути за тих, хто ще не кинув": "Hodit za ty, kdo ještě neházeli",
    "На весь екран": "Na celou obrazovku",
    "Вийти з повного екрана": "Ukončit celou obrazovku",
    "Меню": "Menu",
    "Звук: {s}": "Zvuk: {s}",
    "увімкнено": "zapnutý",
    "вимкнено": "vypnutý",
    "Почати гру": "Začít hru",
    "Нова гра": "Nová hra",
    "Назад у лобі": "Zpět do lobby",
    "Оновити стіл": "Obnovit stůl",
    "● кімната відкрита": "● místnost je otevřená",
    "✕ кімната вже відкрита деінде": "✕ místnost je už otevřená jinde",
    "✕ помилка мережі": "✕ chyba sítě",
    " · 👀 глядачів: {n}": " · 👀 diváků: {n}",
    "КІМНАТА {n}": "MÍSTNOST {n}",
    "бот": "bot",
    "готовий": "připraven",
    "відключився…": "odpojen…",
    "Натисни, щоб перекинути в іншу команду": "Klikni pro přesun do druhého týmu",
    "вільне місце": "volné místo",
    "Потрібно щонайменше {a} гравці (зараз {b})": "Jsou potřeba aspoň {a} hráči (teď {b})",
    "Першим ходить <b></b>!": "První jde <b></b>!",
    "Нічия на {a}! Перекидають: {b}": "Remíza na {a}! Znovu hází: {b}",
    "Кидайте кубик на телефонах — хто ходить першим?": "Házejte kostkou na telefonech — kdo půjde první?",
    "ходить першим": "jde první",
    "кидки: {n}": "hody: {n}",
    "Колода: {n}": "Balíček: {n}",
    "ходить ▸": "na tahu ▸",
    "{n} карти": "{n} karty",
    "Перемогла команда": "Vyhrál tým",
    "Нічия — ніхто не вижив": "Remíza — nikdo nepřežil",
    "Нічия між": "Remíza mezi",
    "Переможець": "Vítěz",
    " вижив": " přežil(a)",
    " вибув": " vypadl(a)",

    // ---------- рушій: режими, поле, команди, спецкарти, кольори
    "Мале": "Malá", "Середнє": "Střední", "Велике": "Velká",
    "Класика": "Klasika", "Виживає останній на полі": "Přežije poslední na ploše",
    "Командна": "Týmová", "Дві команди. Своїх не вибиваєш — перемагає команда, що вижила": "Dva týmy. Své nevyřadíš — vyhrává tým, který přežije",
    "На очки": "Na body", "Очко за кожну пройдену карту, +5 тим, хто вижив": "Bod za každou projetou kartu, +5 těm, kdo přežijí",
    "Сонце": "Slunce", "Місяць": "Měsíc",
    "Ще хід": "Tah navíc", "Після цієї карти ходиш ще раз": "Po této kartě hraješ ještě jednou",
    "Обмін": "Výměna", "Міняєшся картами з наступним гравцем": "Vyměníš si karty s dalším hráčem",
    "Відбивач": "Odrážeč", "Усі лінії розвертають назад — пастка для того, хто стоїть поруч": "Všechny čáry vedou zpět — past pro toho, kdo stojí vedle",
    "Телепорт": "Teleport", "Після ходу фішка стрибає у випадкову точку на краю. Рятує від вильоту": "Po tahu figurka skočí na náhodné místo na okraji. Zachrání před vyletěním",
    "Магістраль": "Dálnice", "Усі лінії прямі — наскрізь через центр": "Všechny čáry vedou rovně — skrz střed",
    "Кути": "Rohy", "Лінії огинають кути — короткі повороти": "Čáry obcházejí rohy — krátké zatáčky",
    "Злодій": "Zloděj", "Забираєш випадкову карту в наступного гравця": "Vezmeš náhodnou kartu dalšímu hráči",
    "Пропуск": "Vynechání", "Наступний гравець пропускає хід": "Další hráč vynechá tah",
    "Червоний": "Červená", "Помаранчевий": "Oranžová", "Жовтий": "Žlutá", "Зелений": "Zelená",
    "Бірюзовий": "Tyrkysová", "Синій": "Modrá", "Фіолетовий": "Fialová", "Рожевий": "Růžová",
    // ---------- рушій: помилки
    "Цей колір уже зайнятий": "Tahle barva je už obsazená",
    "Таке ім'я вже є": "Tohle jméno už někdo má",
    "Стіл заповнений": "Stůl je plný",
    "Ботів можна додати тільки в лобі": "Boty lze přidat jen v lobby",
    "Не можна": "Nelze",
    "Команду можна змінити тільки в лобі": "Tým lze změnit jen v lobby",
    "Немає такої команди": "Takový tým neexistuje",
    "Налаштування можна міняти тільки в лобі": "Nastavení lze měnit jen v lobby",
    "Невідоме налаштування": "Neznámé nastavení",
    "Потрібно щонайменше 2 гравці": "Jsou potřeba aspoň 2 hráči",
    "Зараз не час кидати кубик": "Teď se kostkou nehází",
    "Зараз перекидають інші гравці": "Teď hází znovu jiní hráči",
    "Ти вже кинув": "Už jsi házel(a)",
    "Гра не йде": "Hra neběží",
    "Зараз не твій хід": "Teď nejsi na tahu",
    "Такої карти в тебе немає": "Takovou kartu nemáš",
    "Так ти вибуваєш, а є безпечний варіант. Покрути карту або візьми іншу.":
      "Takhle vypadneš, ale existuje bezpečná možnost. Otoč kartu nebo vezmi jinou.",
  };
  const DICT = { cs: CS };

  function detect() {
    try { const s = localStorage.getItem(KEY); if (s && LANGS[s]) return s; } catch (e) {}
    for (const x of navigator.languages || [navigator.language || ""]) {
      const c = String(x).toLowerCase();
      if (c.startsWith("cs") || c.startsWith("sk")) return "cs";
      if (c.startsWith("uk")) return "uk";
    }
    return "uk";
  }
  let lang = detect();
  const listeners = [];

  function tr(s, vars) {
    if (s == null) return "";
    s = String(s);
    const d = DICT[lang];
    let r = d && Object.prototype.hasOwnProperty.call(d, s) ? d[s] : s;
    if (vars) r = r.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
    return r;
  }

  // ---------- статичний HTML
  const origText = new WeakMap(), origAttr = new WeakMap(), origHtml = new WeakMap();
  const ATTRS = ["placeholder", "title", "aria-label"];
  function translateText(raw) {
    const key = raw.trim();
    if (!key) return raw;
    const t = tr(key);
    return t === key ? raw : raw.replace(key, t);
  }
  function apply(root) {
    root = root || document.body;
    if (!root) return;
    document.documentElement.lang = lang;
    if (!origText.has(document)) origText.set(document, document.title);
    document.title = translateText(origText.get(document));
    root.querySelectorAll("[data-th]").forEach(el => {
      if (!origHtml.has(el)) origHtml.set(el, el.innerHTML.trim());
      el.innerHTML = tr(origHtml.get(el));
    });
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        const p = n.parentElement;
        if (!p || p.closest("script,style,[data-th],[data-noi18n]")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    for (let n = w.nextNode(); n; n = w.nextNode()) {
      if (!origText.has(n)) {
        // перекладаємо лише вузли, текст яких є в словнику (тобто з HTML-розмітки, а не з даних гри)
        if (!Object.prototype.hasOwnProperty.call(CS, n.nodeValue.trim())) continue;
        origText.set(n, n.nodeValue);
      }
      n.nodeValue = translateText(origText.get(n));
    }
    root.querySelectorAll("[placeholder],[title],[aria-label]").forEach(el => {
      let o = origAttr.get(el);
      if (!o) { o = {}; for (const a of ATTRS) if (el.hasAttribute(a) && Object.prototype.hasOwnProperty.call(CS, el.getAttribute(a))) o[a] = el.getAttribute(a); origAttr.set(el, o); }
      for (const a in o) el.setAttribute(a, tr(o[a]));
    });
  }

  function setLang(l, save) {
    if (!LANGS[l] || l === lang) return;
    lang = l;
    if (save !== false) { try { localStorage.setItem(KEY, l); } catch (e) {} }
    apply();
    document.querySelectorAll(".langsw button").forEach(b => b.classList.toggle("on", b.dataset.l === lang));
    listeners.forEach(fn => { try { fn(lang); } catch (e) { console.error(e); } });
  }
  // мову змінили в іншій вкладці чи в iframe хоста — підхоплюємо
  window.addEventListener("storage", e => { if (e.key === KEY && e.newValue) setLang(e.newValue, false); });

  // перемикач UA | CZ
  function switcher() {
    if (!document.getElementById("langsw-css")) {
      const st = document.createElement("style");
      st.id = "langsw-css";
      st.textContent = `.langsw{display:inline-flex;gap:2px;padding:3px;border-radius:12px;background:#211a13;border:2px solid #3d3024;z-index:31}
.langsw button{font:800 13px/1 "Segoe UI",system-ui,sans-serif;letter-spacing:.06em;color:#a8977f;background:none;border:0;border-radius:9px;padding:8px 10px;cursor:pointer}
.langsw button.on{background:#f2b43c;color:#2a1a05}`;
      document.head.appendChild(st);
    }
    const box = document.createElement("div");
    box.className = "langsw"; box.setAttribute("data-noi18n", "");
    for (const l of Object.keys(LANGS)) {
      const b = document.createElement("button");
      b.type = "button"; b.dataset.l = l; b.textContent = LANGS[l];
      b.className = l === lang ? "on" : "";
      b.onclick = e => { e.stopPropagation(); setLang(l); };
      box.appendChild(b);
    }
    return box;
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => apply());
  else apply();

  g.tr = tr;
  g.I18N = {
    get lang() { return lang; }, setLang, apply, switcher, tr,
    onChange(fn) { listeners.push(fn); },
  };
})(window);
