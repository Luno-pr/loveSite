'use strict';

/* ============================================================
 * ЗВЁЗДНОЕ НЕБО
 * Всё рисуется на <canvas> — это, по сути, битмапа,
 * в которую мы каждый кадр заново рисуем пиксели.
 * Аналогия из JavaFX: javafx.scene.canvas.Canvas + GraphicsContext.
 * ============================================================ */

// ---------- Настройки (крути смело) ----------
const STAR_DENSITY = 0.00018;        // звёзд на 1 кв. пиксель экрана
const FLIGHT_MIN_DURATION = 0.9;     // самый быстрый полёт звезды, сек
const FLIGHT_MAX_DURATION = 1.8;     // самый долгий полёт звезды, сек
const FLIGHT_SPREAD = 0.3;           // разброс задержек старта, сек

// ---------- Получаем холст и "кисть" ----------
const canvas = document.getElementById('sky');
const text = document.getElementById('text');
const text2 = document.getElementById('hint');
const ctx = canvas.getContext('2d'); // контекст 2D-рисования (~ GraphicsContext)

// Логический размер окна (в CSS-пикселях)
let viewWidth = 0;
let viewHeight = 0;

let counter = 0;

const stars = [];   // звёзды на небе
let skyOpened = false;  // открыла ли она небо кнопкой (влияет на resize)

/* ============================================================
 * ФУНКЦИЯ СГЛАЖИВАНИЯ
 * Плавное торможение: 1 - (1 - t)^3.
 * При t = 0 даёт 0, при t = 1 даёт 1, но в начале растёт быстро,
 * а к концу замедляется — звезда «вылетает и мягко подлетает к цели».
 * ============================================================ */
function easeOutCubic(t) {
    const inv = 1 - t;
    return 1 - inv * inv * inv;
}

/* ============================================================
 * КЛАСС ЗВЕЗДЫ
 * Мерцание сделано через синус: у каждой звезды своя фаза и
 * своя скорость, поэтому все мерцают вразнобой, а не хором.
 * ============================================================ */
class Star {
    constructor() {
        // «Домашняя» позиция — где звезда окажется, когда долетит
        this.homeX = Math.random() * viewWidth;
        this.homeY = Math.random() * viewHeight;

        // Текущая позиция (до вылета совпадает с домашней)
        this.x = this.homeX;
        this.y = this.homeY;

        this.radius = 0.3 + Math.random() * 1.3;   // радиус яркого ядра
        this.brightness = 0.4 + Math.random() * 0.6; // максимальная яркость
        this.phase = Math.random() * Math.PI * 2;  // стартовая фаза синуса
        this.twinkleSpeed = 0.5 + Math.random() * 1.5; // рад/сек

        this.flight = null;   // объект полёта; null = звезда просто мерцает
    }

    /* Отправляет звезду в полёт: вылетает из точки (fromX, fromY)
       и летит к своей домашней позиции.
       delay — задержка старта в секундах: благодаря ей звёзды
       вылетают не все разом, а волной. */
    startFlight(fromX, fromY, delay) {
        this.x = fromX;
        this.y = fromY;
        this.flight = {
            fromX: fromX,
            fromY: fromY,
            prevX: fromX,   // позиция на прошлом кадре — по ней рисуем хвост
            prevY: fromY,
            progress: 0,    // прогресс полёта от 0 до 1
            duration: FLIGHT_MIN_DURATION + Math.random() * (FLIGHT_MAX_DURATION - FLIGHT_MIN_DURATION),
            delay: delay
        };
    }

    update(dt) {
        this.phase += this.twinkleSpeed * dt;   // мерцание идёт всегда

        const f = this.flight;
        if (f === null) return;   // полёта нет — звезда просто мерцает на месте

        if (f.delay > 0) {          // ещё ждём своей очереди на старт
            f.delay -= dt;
            return;
        }

        f.prevX = this.x;           // запоминаем, где были — нарисуем хвост
        f.prevY = this.y;

        f.progress += dt / f.duration;

        if (f.progress >= 1) {
            // Полёт окончен: встаём точно в домашнюю точку и «забываем» полёт
            this.x = this.homeX;
            this.y = this.homeY;
            this.flight = null;
            return;
        }

        // Интерполируем позицию между стартом и целью по кривой торможения
        const t = easeOutCubic(f.progress);
        this.x = f.fromX + (this.homeX - f.fromX) * t;
        this.y = f.fromY + (this.homeY - f.fromY) * t;
    }

    draw() {
        // sin даёт значение от -1 до 1 -> переводим в диапазон 0.1..1
        const glow = 0.55 + 0.45 * Math.sin(this.phase);

        let alpha = this.brightness * glow;
        let radius = this.radius;
        let halo = 2;   // во сколько раз ореол свечения больше ядра

        // Летящая звезда ярче и толще, а ореол у неё заметно больше:
        // получается «раскалённая» точка, которая остывает к моменту посадки.
        if (this.flight !== null) {
            const power = 1 - this.flight.progress;  // 1 на старте -> 0 в финише
            alpha = Math.min(1, alpha + power * 0.75);
            radius = radius + power * 1.2;
            halo = halo + power * 5;

            // Хвост: светящаяся черта от прошлого кадра к текущему.
            // Кадры идут подряд, и короткие отрезки сливаются в сплошной след.
            ctx.beginPath();
            ctx.moveTo(this.flight.prevX, this.flight.prevY);
            ctx.lineTo(this.x, this.y);
            ctx.strokeStyle = `rgba(190, 170, 255, ${power * 0.8})`;
            ctx.lineWidth = radius * 1.5;
            ctx.lineCap = 'round';
            ctx.stroke();
        }

        // Внешнее свечение — большой полупрозрачный круг.
        // Это дешёвый аналог blur-эффекта: рисовать два круга
        // намного быстрее, чем применять тени/фильтры к каждой звезде.
        ctx.beginPath();
        ctx.arc(this.x, this.y, radius * halo, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(180, 180, 255, ${alpha * 0.15})`;
        ctx.fill();

        // Яркое ядро звезды
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.fill();
    }
}

/* ============================================================
 * РАЗМЕР ХОЛСТА И devicePixelRatio
 *
 * У canvas есть ДВА размера:
 *  1) CSS-размер — сколько места занимает на странице;
 *  2) внутренний размер буфера — сколько реальных пикселей рисуем.
 *
 * На экранах с масштабированием (retina, телефоны, 125% в Windows)
 * один CSS-пиксель = несколько физических. Если буфер не увеличить,
 * картинка будет мыльной. Это тот же принцип, что масштабирование
 * рендер-буфера в играх.
 * ============================================================ */
function resize() {
    const dpr = window.devicePixelRatio || 1;

    viewWidth = window.innerWidth;
    viewHeight = window.innerHeight;

    canvas.width = Math.round(viewWidth * dpr);   // буфер в физ. пикселях
    canvas.height = Math.round(viewHeight * dpr);

    // Масштабируем систему координат, чтобы дальше работать
    // в привычных CSS-пикселях и не умножать всё на dpr вручную
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Пересоздаём звёзды под новую площадь экрана.
    // До нажатия кнопки небо пустое — звёзды не нужны
    stars.length = 0;
    if (!skyOpened) return;

    const count = Math.round(viewWidth * viewHeight * STAR_DENSITY);
    for (let i = 0; i < count; i++) {
        stars.push(new Star());
    }
}

/* Зажигает небо: рождает звёзды в точке (fromX, fromY)
   и разлетает их по случайным «домашним» позициям. */
function revealSky(fromX, fromY) {
    skyOpened = true;

    const count = Math.round(viewWidth * viewHeight * STAR_DENSITY);
    for (let i = 0; i < count; i++) {
        const star = new Star();
        star.startFlight(fromX, fromY, Math.random() * FLIGHT_SPREAD);
        stars.push(star);
    }
}

window.addEventListener('resize', resize);
resize();

/* ============================================================
 * ГЛАВНЫЙ ЦИКЛ АНИМАЦИИ
 *
 * requestAnimationFrame — это аналог AnimationTimer из JavaFX:
 * браузер вызывает нашу функцию перед каждым новым кадром
 * (обычно 60 раз в секунду, под частоту монитора).
 *
 * dt (дельта времени) считаем, чтобы скорость анимации не
 * зависела от FPS: движение задаём в "единицах в секунду".
 * ============================================================ */
let lastTime = performance.now();

function frame(now) {
    // now и lastTime — метки в миллисекундах, переводим в секунды
    let dt = (now - lastTime) / 1000;
    lastTime = now;
    // Защита от огромного dt, если вкладка была свёрнута
    if (dt > 0.05) dt = 0.05;

    // Полностью стираем предыдущий кадр — фон-градиент рисует CSS
    ctx.clearRect(0, 0, viewWidth, viewHeight);

    // Обновляем и рисуем звёзды
    for (const star of stars) {
        star.update(dt);
        star.draw();
    }

    // Просим браузер вызвать нас снова на следующем кадре
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

/* ============================================================
 * СТАРТ ПО КНОПКЕ
 * ============================================================ */
const welcomeBox = document.getElementById('welcome');
const startButton = document.getElementById('startButton');
const nightLayer = document.getElementById('night');
const finalMessage = document.getElementById('finalMessage');

/* Сколько ждать, пока проиграется анимация звёзд.
   Самая долгая звезда летит FLIGHT_MAX_DURATION секунд, плюс задержка старта.
   На 1000 умножаем потому, что таймеры в JS считают в МИЛЛИСЕКУНДАХ,
   а FLIGHT_PAUSE_FACTOR — во сколько раз пауза длиннее полёта
   (1 = текст появляется ровно в момент посадки последней звезды). */
const FLIGHT_PAUSE_FACTOR = 2;
const STAR_FLIGHT_MS = Math.round((FLIGHT_MAX_DURATION + FLIGHT_SPREAD) * 1000 * FLIGHT_PAUSE_FACTOR);

startButton.addEventListener('click', () => {

    if (counter === 0){
        text.textContent = '';
        text2.textContent = 'Нажми еще раз';
        counter = 1;
        return;
    }


    if (skyOpened) return;   // защита от повторного клика

    // 1. Узнаём, где кнопка находится на экране прямо сейчас.
    //    getBoundingClientRect() отдаёт координаты относительно вьюпорта,
    //    а canvas у нас тоже растянут на весь вьюпорт, поэтому
    //    системы координат совпадают и пересчитывать ничего не нужно.
    const rect = startButton.getBoundingClientRect();
    const originX = rect.left + rect.width / 2;   // центр кнопки по X
    const originY = rect.top + rect.height / 2;   // центр кнопки по Y

    // 2. Гасим приглашение: класс .is-hidden меняет opacity и transform,
    //    а transition из style.css делает это плавно.
    welcomeBox.classList.add('is-hidden');

    // Когда затухание закончится — убираем блок совсем, чтобы он не мешал.
    // { once: true } означает: слушатель сработает один раз и сам удалится.
    welcomeBox.addEventListener('transitionend', () => {
        welcomeBox.style.display = 'none';
    }, { once: true });

    // 3. Опускаем ночь: слой .nightLayer плавно поднимает прозрачность
    //    с 0 до 1, и белая страница постепенно уходит под градиент.
    nightLayer.classList.add('is-visible');

    // 4. Зажигаем небо ровно из точки кнопки
    revealSky(originX, originY);

    // 5. Пока звёзды летят, ждём в стороне. Когда они долетели — добавляем
    //    класс, а CSS плавно поднимает прозрачность с 0 до 1 и сдвигает текст на место.
    setTimeout(() => {
        document.body.classList.add('is-open');
        finalMessage.classList.add('is-visible');
    }, STAR_FLIGHT_MS);
});

/* ============================================================
 * ПОЯВЛЕНИЕ БЛОКОВ ПРИ ПРОКРУТКЕ
 * IntersectionObserver — встроенный «наблюдатель» браузера.
 * Он сам следит за элементами и сообщает, когда элемент
 * попадает в видимую область окна (или уходит из неё).
 * ============================================================ */
const revealObserver = new IntersectionObserver((entries, observer) => {
    for (const entry of entries) {
        // Нас интересует только случай «блок ПОПАЛ в экран»
        if (!entry.isIntersecting) continue;

        // Тот же класс-переключатель, что использует .finalMessage:
        // плавность обеспечивает CSS, а не JavaScript
        entry.target.classList.add('is-visible');

        // Анимация одноразовая: дальше за этим блоком следить не нужно
        observer.unobserve(entry.target);
    }
}, {
    // Порог: блок должен показаться в окне хотя бы на четверть
    threshold: 0.25
});

// Подписываем наблюдателя на все блоки с классом .reveal
for (const element of document.querySelectorAll('.reveal')) {
    revealObserver.observe(element);
}
