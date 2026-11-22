(function () {
    var SCENES = {
        clear: {
            colors: ["#00000000", "#0d2238", "#1b4a78", "#3d86c6", "#cfe6f7"],
            sun: [0.52, 1.1],
            spread: 2.8,
            glow: 0.72,
            base: 0.28,
            intensity: 0.78,
            wind: 0.35,
            rain: 0,
            stars: 0
        },
        dusk: {
            colors: ["#00000000", "#3a1b0d", "#8a3c18", "#e07a3d", "#f09a5e"],
            sun: [0.68, 1.02],
            spread: 2.4,
            glow: 0.7,
            base: 0.26,
            intensity: 0.78,
            wind: 0.3,
            rain: 0,
            stars: 0
        },
        night: {
            colors: ["#00000000", "#0b1222", "#17233f", "#2c3f6b", "#d8e0ff"],
            sun: [0.24, 0.98],
            spread: 5,
            glow: 0.28,
            base: 0.2,
            intensity: 0.82,
            wind: 0.18,
            rain: 0,
            stars: 1
        },
        cloudy: {
            colors: ["#00000000", "#17191d", "#2b2f36", "#4a5059", "#8a919b"],
            sun: [0.7, 1.05],
            spread: 2,
            glow: 0.12,
            base: 0.42,
            intensity: 0.8,
            wind: 0.4,
            rain: 0,
            stars: 0
        },
        rain: {
            colors: ["#00000000", "#0b1626", "#14304f", "#275a8c", "#8fbde8"],
            sun: [0.7, 1.05],
            spread: 2,
            glow: 0,
            base: 0.34,
            intensity: 0.8,
            wind: 0.55,
            rain: 1,
            stars: 0
        },
        storm: {
            colors: ["#00000000", "#100d1f", "#221c42", "#3d3478", "#a99cf0"],
            sun: [0.7, 1.05],
            spread: 2,
            glow: 0,
            base: 0.3,
            intensity: 0.8,
            wind: 0.7,
            rain: 1,
            stars: 0
        }
    };

    var PREVIEW_LABELS = {
        clear: "clear skies",
        dusk: "sunset",
        night: "clear night",
        cloudy: "cloudy",
        rain: "raining",
        storm: "thunderstorms"
    };

    var BAYER = [
        0, 8, 2, 10,
        12, 4, 14, 6,
        3, 11, 1, 9,
        15, 7, 13, 5
    ];

    var CELL = 3;
    var root = document.getElementById("site");
    var stage = document.querySelector(".sky-stage");
    var canvas = document.querySelector(".sky-canvas");
    var pauseBtn = document.getElementById("pause-sky");
    var weatherEl = document.querySelector(".now-weather");
    var weatherSep = document.querySelector(".now-weather-sep");
    var clockEl = document.querySelector(".clock");
    var clockSep = document.querySelector(".now-clock-sep");

    document.querySelectorAll(".poster img").forEach(function (img) {
        img.addEventListener("error", function () {
            img.hidden = true;
        });
    });

    var skyParam = new URLSearchParams(location.search).get("sky");
    var preview = Object.prototype.hasOwnProperty.call(PREVIEW_LABELS, skyParam) ? skyParam : null;
    var sceneName = preview || root.getAttribute("data-scene") || "night";
    root.setAttribute("data-scene", sceneName);

    if (preview) showWeather(PREVIEW_LABELS[preview]);

    var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var paused = reduced;
    var ctx = canvas.getContext("2d", { alpha: true });
    var buffer = document.createElement("canvas");
    var bufferCtx = buffer.getContext("2d", { alpha: true });
    var frame = 0;
    var raf = 0;
    var last = 0;
    var acc = 0;
    var parsed = {};

    Object.keys(SCENES).forEach(function (name) {
        parsed[name] = SCENES[name].colors.map(parseHex);
    });

    if (ctx && bufferCtx) {
        if (reduced) setPaused(true);
        draw(0);
        stage.setAttribute("data-state", "running");
        if (!reduced) raf = requestAnimationFrame(loop);
        window.addEventListener("resize", function () {
            draw(frame);
        });
        pauseBtn.addEventListener("click", function () {
            setPaused(!paused);
            if (!paused) {
                last = 0;
                if (!raf) raf = requestAnimationFrame(loop);
            }
        });
    } else {
        pauseBtn.hidden = true;
    }

    startClock();
    if (!preview) loadWeather();
    setupFlags();
    setupReveal();
    setupShelf();

    function setPaused(next) {
        paused = next;
        pauseBtn.setAttribute("aria-pressed", String(paused));
        pauseBtn.textContent = paused ? "play sky" : "pause sky";
    }

    function loop(now) {
        raf = requestAnimationFrame(loop);
        if (paused) return;
        if (!last) last = now;
        var delta = Math.min(100, now - last);
        last = now;
        acc += delta;
        if (acc < 1000 / 30) return;
        frame += acc;
        acc = 0;
        draw(frame);
    }

    function draw(time) {
        var rect = stage.getBoundingClientRect();
        var cssW = Math.max(1, Math.floor(rect.width));
        var cssH = Math.max(1, Math.floor(rect.height));
        var gridW = Math.max(1, Math.ceil(cssW / CELL));
        var gridH = Math.max(1, Math.ceil(cssH / CELL));
        if (canvas.width !== cssW || canvas.height !== cssH) {
            canvas.width = cssW;
            canvas.height = cssH;
        }
        if (buffer.width !== gridW || buffer.height !== gridH) {
            buffer.width = gridW;
            buffer.height = gridH;
        }

        var scene = SCENES[sceneName];
        var colors = parsed[sceneName];
        var image = bufferCtx.createImageData(gridW, gridH);
        var data = image.data;
        var levels = 16;
        var seconds = time * 0.001;

        for (var y = 0; y < gridH; y++) {
            for (var x = 0; x < gridW; x++) {
                var light = sample(x, y, gridW, gridH, seconds, scene);
                var scaled = Math.min(0.999, Math.max(0, light)) * levels;
                var base = Math.floor(scaled);
                var frac = scaled - base;
                var threshold = (BAYER[((y & 3) * 4) + (x & 3)] + 0.5) / 16;
                var step = Math.min(levels, base + (frac > threshold ? 1 : 0));
                var color = mixPalette(colors, step / levels);
                var i = (y * gridW + x) * 4;
                data[i] = color[0];
                data[i + 1] = color[1];
                data[i + 2] = color[2];
                data[i + 3] = color[3];
            }
        }

        bufferCtx.putImageData(image, 0, 0);
        ctx.clearRect(0, 0, cssW, cssH);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(buffer, 0, 0, cssW, cssH);
    }

    function sample(x, y, w, h, seconds, scene) {
        var u = (x + 0.5) / w;
        var v = (y + 0.5) / h;
        var aspect = w / Math.max(1, h);
        var curve = (u - 0.5) * (u - 0.5) * 0.22;
        var edge = 0.4 + curve;
        var above = Math.max(0, edge - v);
        var below = Math.max(0, v - edge);
        var slide = seconds * 0.018 * (0.4 + scene.wind);
        var px = u * aspect + slide;
        var warp = noise(px * 1.25, above * 2.2);
        var curtains = noise(px * 3.6 + warp * 1.5 - slide * 0.6, above * 6.5);
        var lit = 0.35 + curtains * 0.75;
        var glow = Math.exp(-above * 16) * lit + Math.exp(-above * 6.5) * curtains * 0.22;
        glow *= 0.7 + scene.glow;
        var side = Math.exp(-Math.pow((u - scene.sun[0]) * 1.7, 2));
        glow *= 0.62 + 0.38 * side;
        var rim = Math.exp(-below * 42) * (0.62 + warp * 0.3);
        var light = (above > 0 ? glow : rim) * scene.intensity;

        if (scene.stars && above > 0.12) {
            if (hash(x, y) > 0.9974) light = Math.max(light, 0.78);
        }

        if (scene.rain) {
            if (hash(x, 9) > 0.86) {
                var speed = 0.6 + hash(x, 4) * 0.5;
                var fall = (v * 1.8 + seconds * 0.22 * speed + hash(x, 2)) % 1;
                var streak = Math.max(0, 1 - Math.abs(fall - 0.18) / 0.1);
                if (streak > 0) light = Math.max(light, 0.34 + streak * 0.28);
            }
        }

        return Math.min(1, light);
    }

    function mixPalette(colors, t) {
        var scaled = Math.min(0.999, Math.max(0, t)) * (colors.length - 1);
        var index = Math.floor(scaled);
        var mix = scaled - index;
        var from = colors[index];
        var to = colors[Math.min(colors.length - 1, index + 1)];
        return [
            from[0] + (to[0] - from[0]) * mix,
            from[1] + (to[1] - from[1]) * mix,
            from[2] + (to[2] - from[2]) * mix,
            from[3] + (to[3] - from[3]) * mix
        ];
    }

    function noise(x, y) {
        var ix = Math.floor(x);
        var iy = Math.floor(y);
        var fx = x - ix;
        var fy = y - iy;
        var sx = fx * fx * (3 - 2 * fx);
        var sy = fy * fy * (3 - 2 * fy);
        var v00 = hash(ix, iy);
        var v10 = hash(ix + 1, iy);
        var v01 = hash(ix, iy + 1);
        var v11 = hash(ix + 1, iy + 1);
        return v00 * (1 - sx) * (1 - sy) + v10 * sx * (1 - sy) + v01 * (1 - sx) * sy + v11 * sx * sy;
    }

    function hash(x, y) {
        var n = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
    }

    function parseHex(hex) {
        var value = parseInt(hex.slice(1), 16);
        if (hex.length === 9) {
            return [(value >> 24) & 255, (value >> 16) & 255, (value >> 8) & 255, value & 255];
        }
        return [(value >> 16) & 255, (value >> 8) & 255, value & 255, 255];
    }

    function setupFlags() {
        var button = document.getElementById("polyglot");
        var stage = document.getElementById("flag-stage");
        if (!button || !stage) return;
        var closeTimer = 0;

        function lockClosed() {
            if (stage.classList.contains("is-open")) return;
            stage.hidden = true;
            document.documentElement.style.overflow = "";
            document.body.style.overflow = "";
        }

        function setOpen(open) {
            window.clearTimeout(closeTimer);
            button.setAttribute("aria-expanded", String(open));
            if (open) {
                stage.hidden = false;
                document.documentElement.style.overflow = "hidden";
                document.body.style.overflow = "hidden";
                requestAnimationFrame(function () {
                    requestAnimationFrame(function () {
                        stage.classList.add("is-open");
                    });
                });
                return;
            }
            stage.classList.remove("is-open");
            closeTimer = window.setTimeout(lockClosed, 420);
        }

        button.addEventListener("click", function () {
            setOpen(stage.hidden || !stage.classList.contains("is-open"));
        });

        stage.addEventListener("click", function (event) {
            if (event.target.closest(".polaroid")) return;
            setOpen(false);
        });

        document.addEventListener("keydown", function (event) {
            if (event.key === "Escape" && !stage.hidden) {
                setOpen(false);
                button.focus();
            }
        });
    }

    function setupReveal() {
        var nodes = document.querySelectorAll(".block-head, .chapter, .catalog > li");
        nodes.forEach(function (node) {
            var match = node.classList.contains("chapter") ? ".chapter" : node.classList.contains("block-head") ? ".block-head" : "li";
            var siblings = Array.prototype.filter.call(node.parentElement.children, function (child) {
                return child.matches(match);
            });
            var index = siblings.indexOf(node);
            if (index > 0) node.style.setProperty("--d", Math.min(index, 5) * 80 + "ms");
            if (reduced) node.classList.add("in");
        });
        var posters = document.querySelectorAll(".poster");
        var shelf = document.getElementById("shelf-track");
        function showPosters() {
            posters.forEach(function (poster, index) {
                poster.style.setProperty("--d", Math.min(index, 4) * 70 + "ms");
                poster.classList.add("in");
            });
        }
        if (reduced || !("IntersectionObserver" in window)) {
            nodes.forEach(function (node) { node.classList.add("in"); });
            showPosters();
            return;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                entry.target.classList.add("in");
                io.unobserve(entry.target);
            });
        }, { threshold: 0.22, rootMargin: "0px 0px -6% 0px" });
        nodes.forEach(function (node) { io.observe(node); });
        if (!shelf) return;
        var shelfIO = new IntersectionObserver(function (entries) {
            if (!entries.some(function (entry) { return entry.isIntersecting; })) return;
            showPosters();
            shelfIO.disconnect();
        }, { threshold: 0.2 });
        shelfIO.observe(shelf);
    }

    function setupShelf() {
        var track = document.getElementById("shelf-track");
        var prev = document.getElementById("shelf-prev");
        var next = document.getElementById("shelf-next");
        if (!track || !prev || !next) return;
        var shelf = track.parentElement;
        var autoDir = 1;

        function cardSpan() {
            var card = track.querySelector(".poster");
            if (!card) return track.clientWidth;
            var styles = window.getComputedStyle(track);
            var gap = parseFloat(styles.columnGap || styles.gap) || 12;
            return card.getBoundingClientRect().width + gap;
        }

        function maxScroll() {
            return Math.max(0, track.scrollWidth - track.clientWidth);
        }

        function updateButtons() {
            var max = maxScroll();
            prev.disabled = track.scrollLeft <= 2;
            next.disabled = track.scrollLeft >= max - 2;
        }

        function step(direction) {
            var left = Math.min(maxScroll(), Math.max(0, track.scrollLeft + direction * cardSpan()));
            track.scrollTo({ left: left, behavior: reduced ? "auto" : "smooth" });
        }

        prev.addEventListener("click", function () { step(-1); });
        next.addEventListener("click", function () { step(1); });

        shelf.addEventListener("keydown", function (event) {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            event.preventDefault();
            step(event.key === "ArrowRight" ? 1 : -1);
        });

        track.addEventListener("wheel", function (event) {
            if (Math.abs(event.deltaX) > Math.abs(event.deltaY)) return;
            var max = maxScroll();
            var nextLeft = track.scrollLeft + event.deltaY;
            if (nextLeft < 0 || nextLeft > max) return;
            event.preventDefault();
            track.scrollLeft = nextLeft;
        }, { passive: false });

        track.addEventListener("scroll", updateButtons, { passive: true });
        window.addEventListener("resize", updateButtons);
        updateButtons();

        if (reduced) return;
        var onScreen = false;
        if ("IntersectionObserver" in window) {
            var watch = new IntersectionObserver(function (entries) {
                onScreen = entries.some(function (entry) { return entry.isIntersecting; });
            }, { threshold: 0.4 });
            watch.observe(shelf);
        } else {
            onScreen = true;
        }
        window.setInterval(function () {
            if (!onScreen || document.hidden || shelf.matches(":hover") || shelf.matches(":focus-within")) return;
            if (next.disabled) autoDir = -1;
            else if (prev.disabled) autoDir = 1;
            if (prev.disabled && next.disabled) return;
            step(autoDir);
        }, 4800);
    }

    function startClock() {
        var format = new Intl.DateTimeFormat("en-US", {
            timeZone: "Europe/Oslo",
            hour: "numeric",
            minute: "2-digit",
            hour12: true
        });
        var order = ["h1", "h0", "m1", "m0", "p"];
        var state = { h1: null, h0: null, m1: null, m0: null, p: null };
        var slots = {};
        var tick = document.createElement("span");
        var read = document.createElement("span");
        var period = document.createElement("span");
        var lastText = "";

        tick.className = "tick";
        tick.setAttribute("aria-hidden", "true");
        read.className = "tick-read";

        function wheel(key) {
            return key === "m1" ? 6 : 10;
        }

        function parkBase(mod) {
            return mod === 6 ? 12 : 10;
        }

        function settleDigit(roll, mod, base) {
            var current = Number(roll.style.getPropertyValue("--n"));
            if (!Number.isFinite(current)) return;
            var shown = ((current % mod) + mod) % mod;
            var parked = shown + base;
            if (current === parked) return;
            roll.style.transition = "none";
            roll.style.setProperty("--n", String(parked));
            void roll.offsetWidth;
            roll.style.transition = "";
        }

        function makeDigit(key) {
            var mod = wheel(key);
            var base = parkBase(mod);
            var el = document.createElement("span");
            var roll = document.createElement("span");
            el.className = "tick-digit" + (key === "h1" ? " is-folded" : "");
            roll.className = "tick-roll";
            for (var i = 0; i < 30; i++) {
                var cell = document.createElement("span");
                cell.textContent = String(i % mod);
                roll.appendChild(cell);
            }
            roll.addEventListener("transitionend", function (event) {
                if (event.propertyName !== "transform" || event.target !== roll) return;
                settleDigit(roll, mod, base);
            });
            el.appendChild(roll);
            slots[key] = el;
            return el;
        }

        tick.appendChild(makeDigit("h1"));
        tick.appendChild(makeDigit("h0"));
        var colon = document.createElement("span");
        colon.className = "tick-colon";
        colon.textContent = ":";
        tick.appendChild(colon);
        tick.appendChild(makeDigit("m1"));
        tick.appendChild(makeDigit("m0"));

        period.className = "tick-period";
        var periodRoll = document.createElement("span");
        periodRoll.className = "tick-period-roll";
        ["am", "pm", "am", "pm"].forEach(function (label) {
            var cell = document.createElement("span");
            cell.textContent = label;
            periodRoll.appendChild(cell);
        });
        periodRoll.addEventListener("transitionend", function (event) {
            if (event.propertyName !== "transform" || event.target !== periodRoll) return;
            var current = Number(periodRoll.style.getPropertyValue("--p"));
            if (!Number.isFinite(current) || current < 2) return;
            periodRoll.style.transition = "none";
            periodRoll.style.setProperty("--p", String(current % 2));
            void periodRoll.offsetWidth;
            periodRoll.style.transition = "";
        });
        period.appendChild(periodRoll);
        tick.appendChild(period);
        clockEl.appendChild(tick);
        clockEl.appendChild(read);

        function park(roll, digit, mod) {
            var parked = digit + parkBase(mod);
            if (roll.style.getPropertyValue("--n") === String(parked)) return parked;
            roll.style.transition = "none";
            roll.style.setProperty("--n", String(parked));
            void roll.offsetWidth;
            roll.style.transition = "";
            void roll.offsetWidth;
            return parked;
        }

        function spin(roll, from, to, delay, mod) {
            var parked = park(roll, from, mod);
            var forward = (to - from + mod) % mod;
            if (!forward) return;
            var backward = mod - forward;
            var dest = forward <= backward ? parked + forward : parked - backward;
            roll.style.setProperty("--stagger", String(delay));
            roll.style.setProperty("--n", String(dest));
        }

        function applyDigit(key, next, motion, delay) {
            var el = slots[key];
            var roll = el.firstElementChild;
            var prev = state[key];
            var folded = next == null;
            var mod = wheel(key);

            if (!motion) {
                el.style.transition = "none";
                if (next != null) park(roll, Number(next), mod);
                el.classList.toggle("is-folded", folded);
                void el.offsetWidth;
                el.style.transition = "";
                return;
            }

            el.style.setProperty("--stagger", String(delay));
            if (folded && prev != null) {
                el.classList.add("is-folded");
                return;
            }
            if (!folded && prev == null) {
                park(roll, Number(next), mod);
                el.classList.remove("is-folded");
                return;
            }
            if (!folded && next !== prev) spin(roll, Number(prev), Number(next), delay, mod);
        }

        function applyPeriod(next, motion, delay) {
            var to = next === "pm" ? 1 : 0;
            if (!motion || state.p == null || next === state.p) {
                periodRoll.style.transition = "none";
                periodRoll.style.setProperty("--p", String(to));
                void periodRoll.offsetWidth;
                periodRoll.style.transition = "";
                return;
            }
            var current = Number(periodRoll.style.getPropertyValue("--p"));
            if (!Number.isFinite(current) || current > 1) current = state.p === "pm" ? 1 : 0;
            periodRoll.style.setProperty("--stagger", String(delay));
            periodRoll.style.setProperty("--p", String(current + 1));
        }

        function delaysFor(parts) {
            var changed = {
                h1: parts.h1 !== state.h1,
                h0: parts.h0 !== state.h0,
                m1: parts.m1 !== state.m1,
                m0: parts.m0 !== state.m0,
                p: parts.p !== state.p
            };
            var delay = {};
            var step = 0;
            for (var i = order.length - 1; i >= 0; i--) {
                var key = order[i];
                if (changed[key]) {
                    delay[key] = step;
                    step += 1;
                } else {
                    delay[key] = 0;
                }
            }
            return delay;
        }

        function parseClock(text) {
            var clean = String(text).toLowerCase().replace(/\s+/g, " ").trim();
            var match = clean.match(/^(\d{1,2}):(\d{2})\s*([ap])\.?m\.?$/);
            if (!match) return null;
            var hour = match[1];
            var minute = match[2];
            var suffix = match[3] + "m";
            return {
                h1: hour.length > 1 ? hour.charAt(0) : null,
                h0: hour.charAt(hour.length - 1),
                m1: minute.charAt(0),
                m0: minute.charAt(1),
                p: suffix,
                text: hour + ":" + minute + " " + suffix
            };
        }

        function show(text, animate) {
            var parts = parseClock(text);
            if (!parts) return false;
            var motion = animate && !reduced;
            var delay = delaysFor(parts);
            applyDigit("h1", parts.h1, motion, delay.h1);
            applyDigit("h0", parts.h0, motion, delay.h0);
            applyDigit("m1", parts.m1, motion, delay.m1);
            applyDigit("m0", parts.m0, motion, delay.m0);
            applyPeriod(parts.p, motion, delay.p);
            state = parts;
            read.textContent = parts.text;
            return true;
        }

        function reveal() {
            clockEl.hidden = false;
            clockSep.hidden = false;
            if (clockEl.classList.contains("is-set")) return;
            void clockEl.offsetWidth;
            clockEl.classList.add("is-set");
        }

        function tickNow() {
            var now = new Date();
            var text = format.format(now);
            clockEl.dateTime = now.toISOString();
            if (text === lastText) return;
            var animate = lastText !== "";
            lastText = text;
            if (!show(text, animate)) clockEl.textContent = text;
            reveal();
        }

        tickNow();
        window.setInterval(tickNow, 1000);
    }

    function showWeather(text) {
        weatherEl.textContent = text;
        weatherEl.hidden = false;
        weatherSep.hidden = false;
    }

    function loadWeather() {
        var url = "https://api.open-meteo.com/v1/forecast?latitude=59.9139&longitude=10.7522&current=temperature_2m,weather_code,is_day&timezone=Europe%2FOslo";
        fetch(url, { signal: AbortSignal.timeout(8000) })
            .then(function (response) {
                if (!response.ok) throw new Error("weather");
                return response.json();
            })
            .then(function (data) {
                var current = data.current;
                if (!current || current.temperature_2m == null || current.weather_code == null) return;
                var hour = Number(String(current.time || "").slice(11, 13));
                if (!Number.isFinite(hour)) hour = 12;
                sceneName = sceneFrom(current.weather_code, hour, current.is_day);
                root.setAttribute("data-scene", sceneName);
                showWeather(Math.round(current.temperature_2m) + "°C, " + describe(current.weather_code));
                draw(frame);
            })
            .catch(function () {
                root.setAttribute("data-scene", "night");
            });
    }

    function describe(code) {
        if (code === 0) return "clear";
        if (code === 1) return "mainly clear";
        if (code === 2) return "partly cloudy";
        if (code === 3) return "overcast";
        if (code === 45 || code === 48) return "fog";
        if (code >= 51 && code <= 57) return "drizzle";
        if (code >= 61 && code <= 67) return "rain";
        if (code >= 71 && code <= 77) return "snow";
        if (code >= 80 && code <= 82) return "rain showers";
        if (code === 85 || code === 86) return "snow showers";
        if (code >= 95) return "thunderstorms";
        return "cloudy";
    }

    function sceneFrom(code, hour, isDay) {
        if (code >= 95) return "storm";
        if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
        if (code === 3 || code === 45 || code === 48 || (code >= 71 && code <= 77) || code === 85 || code === 86) return "cloudy";
        var dusk = (hour >= 6 && hour < 9) || (hour >= 16 && hour < 20);
        if (!isDay || hour < 6 || hour >= 21) return "night";
        if (dusk) return "dusk";
        if (code === 2) return "cloudy";
        return "clear";
    }
})();
