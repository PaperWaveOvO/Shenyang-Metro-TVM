document.addEventListener("DOMContentLoaded", () => {
    // 变量定义
    const langBtn = document.querySelector('.button-language');
    const langOverlay = document.getElementById('langOverlay');
    const langModal = document.getElementById('langModal');
    const tvmContainer = document.querySelector('.tvm-container');
    const cancelBtn = document.querySelector('.lang-cancel');
    const confirmBtn = document.querySelector('.lang-confirm');

    const screenByDistance = document.getElementById('screen-by-distance');
    const screenByAmount = document.getElementById('screen-by-amount');

    const now = new Date();

    const year = now.getFullYear();      // 2026
    const month = now.getMonth() + 1;    // 月份从0开始，所以要+1
    const date = now.getDate();          // 12
    const hours = now.getHours();        // 11
    const minutes = now.getMinutes();    // 54

    const isAndroidWebView =
        /Android/i.test(navigator.userAgent) &&
        !/Chrome\/\d+/i.test(navigator.userAgent);

    if (isAndroidWebView) {
        document.documentElement.classList.add('android-webview');
    }

    let currentMode = 'distance';
    let originalLang = document.documentElement.lang || "zh-CN";
    let translations = {};
    let isAnimating = false;
    let switchTimer = null;

    function updateDateTime() {
        const now = new Date();

        // 格式化日期：YYYY-MM-DD
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const date = String(now.getDate()).padStart(2, '0');

        // 格式化时间：HH:mm
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');

        // 找到 HTML 中的元素并赋值
        const dateElement = document.querySelector('.date');
        const timeElement = document.querySelector('.time');

        if (dateElement) dateElement.textContent = `${year}-${month}-${date}`;
        if (timeElement) timeElement.textContent = `${hours}:${minutes}`;
    }

    // 每秒钟调用一次
    setInterval(updateDateTime, 1000);

    // 页面加载时立即执行一次，防止首秒空白
    updateDateTime();

    // 核心 Diamond 算法 (保留)
    const PI = Math.PI;
    const { min, max, cos, sin, tan } = Math;
    const clamp = (v, minVal, maxVal) => max(minVal, min(v, maxVal));
    const lerp = (start, stop, fraction) => start + (stop - start) * fraction;

    class Point { constructor(x, y) { this.x = x; this.y = y; } add(p) { return new Point(this.x + p.x, this.y + p.y); } sub(p) { return new Point(this.x - p.x, this.y - p.y); } mul(s) { return new Point(this.x * s, this.y * s); } }
    class CubicBezier { constructor(p0, p1, p2, p3) { this.p0 = p0; this.p1 = p1; this.p2 = p2; this.p3 = p3; } }
    const BASE_BEZIER_CACHE = new Map();

    const PROFILE_ROUNDED_RECTANGLE = { extendedFraction: 0.5286651, arcFraction: 5.0 / 9.0, bezierCurvatureScale: 1.0732051, arcCurvatureScale: 1.0732051 };
    const PROFILE_CAPSULE = { extendedFraction: 0.5286651 * 0.75, arcFraction: 0.0, bezierCurvatureScale: 1.0, arcCurvatureScale: 1.0 };

    function generateG2Bezier(start, end, startTan, endTan, endCurvature) {
        const a2 = 1.5 * endCurvature;
        const b = startTan.x * endTan.y - startTan.y * endTan.x;
        const dx = end.x - start.x; const dy = end.y - start.y;
        const c1 = -dy * startTan.x + dx * startTan.y; const c2 = dy * endTan.x - dx * endTan.y;
        if (Math.abs(b) < 1e-9) return new CubicBezier(start, start, end, end);
        const lambda0 = -c2 / b - a2 * c1 * c1 / (b * b * b); const lambda3 = -c1 / b;
        const p1 = start.add(new Point(max(lambda0 * startTan.x, 0), max(lambda0 * startTan.y, 0)));
        const p2 = end.sub(new Point(max(lambda3 * endTan.x, 0), max(lambda3 * endTan.y, 0)));
        return new CubicBezier(start, p1, p2, end);
    }

    function getResolvedBezier(profile) {
        const key = JSON.stringify(profile); if (BASE_BEZIER_CACHE.has(key)) return BASE_BEZIER_CACHE.get(key);
        const { arcFraction, extendedFraction, bezierCurvatureScale, arcCurvatureScale } = profile;
        const arcRadians = PI * 0.5 * arcFraction; const bezierRadians = (PI * 0.5 - arcRadians) * 0.5;
        const s = sin(bezierRadians); const c = cos(bezierRadians);
        let bezier;
        if (bezierCurvatureScale === 1.0 && arcCurvatureScale === 1.0) {
            const halfTan = s / (1.0 + c);
            bezier = new CubicBezier(new Point(-extendedFraction, 0), new Point((1.0 - 1.5 / (1.0 + c)) * halfTan, 0), new Point(halfTan, 0), new Point(s, 1.0 - c));
        } else {
            const radiusScale = 1.0 / arcCurvatureScale; const offset = new Point(0.70710678, -0.70710678).mul(1.0 - radiusScale);
            const arcCenter = new Point(0, 1).add(offset); const arcStartPoint = arcCenter.add(new Point(s, -c).mul(radiusScale));
            bezier = generateG2Bezier(new Point(-extendedFraction, 0), arcStartPoint, new Point(1, 0), new Point(c, s), bezierCurvatureScale);
        }
        BASE_BEZIER_CACHE.set(key, bezier); return bezier;
    }

    function getSmoothRectPath(width, height, radiusInput) {
        const r = typeof radiusInput === 'number' ? { tl: radiusInput, tr: radiusInput, br: radiusInput, bl: radiusInput } : radiusInput;
        const maxR = min(width, height) / 2;
        const tl = clamp(r.tl || 0, 0, maxR), tr = clamp(r.tr || 0, 0, maxR), br = clamp(r.br || 0, 0, maxR), bl = clamp(r.bl || 0, 0, maxR);
        let d = ""; const fmt = (n) => n.toFixed(4);
        const moveTo = (x, y) => d += `M ${fmt(x)} ${fmt(y)} `; const lineTo = (x, y) => d += `L ${fmt(x)} ${fmt(y)} `;
        const cubicTo = (x1, y1, x2, y2, x3, y3) => d += `C ${fmt(x1)} ${fmt(y1)}, ${fmt(x2)} ${fmt(y2)}, ${fmt(x3)} ${fmt(y3)} `;
        const getArcAsCubic = (centerX, centerY, radius, startAngle, sweepAngle) => {
            const k = (4 / 3) * tan(sweepAngle / 4);
            const xStart = centerX + cos(startAngle) * radius; const yStart = centerY + sin(startAngle) * radius;
            const xEnd = centerX + cos(startAngle + sweepAngle) * radius; const yEnd = centerY + sin(startAngle + sweepAngle) * radius;
            const cp1x = xStart - k * sin(startAngle) * radius; const cp1y = yStart + k * cos(startAngle) * radius;
            const cp2x = xEnd + k * sin(startAngle + sweepAngle) * radius; const cp2y = yEnd - k * cos(startAngle + sweepAngle) * radius;
            return { xStart, yStart, cp1x, cp1y, cp2x, cp2y, xEnd, yEnd };
        };
        const profile = PROFILE_ROUNDED_RECTANGLE; const capsuleProfile = PROFILE_CAPSULE;
        const centerX = width * 0.5; const centerY = height * 0.5;
        const calcCorner = (cornerR, isXCenter, isYCenter) => {
            if (cornerR <= 0) return null;
            const ratioV = clamp(((isYCenter / cornerR - 1.0) / profile.extendedFraction), 0, 1); const ratioH = clamp(((isXCenter / cornerR - 1.0) / profile.extendedFraction), 0, 1);
            const ratio = min(ratioV, ratioH); const extFrac = lerp(capsuleProfile.extendedFraction, profile.extendedFraction, ratio);
            const arcFrac = lerp(capsuleProfile.arcFraction, profile.arcFraction, ratio); const bezKScale = lerp(capsuleProfile.bezierCurvatureScale, profile.bezierCurvatureScale, ratio);
            const arcKScale = 1.0 + (profile.arcCurvatureScale - 1.0) * ratio; const extFracV = extFrac * ratioV; const extFracH = extFrac * ratioH;
            const offsetV = -cornerR * extFracV; const offsetH = -cornerR * extFracH;
            const bezierP = { extendedFraction: extFrac * ratio, arcFraction: arcFrac, bezierCurvatureScale: bezKScale, arcCurvatureScale: arcKScale };
            return { offsetV, offsetH, bezierV: getResolvedBezier({ ...bezierP, extendedFraction: extFracV }), bezierH: getResolvedBezier({ ...bezierP, extendedFraction: extFracH }), arcKScale, arcFrac };
        };
        const pTL = calcCorner(tl, centerX, centerY), pTR = calcCorner(tr, centerX, centerY), pBR = calcCorner(br, centerX, centerY), pBL = calcCorner(bl, centerX, centerY);
        if (tl > 0 && pTL) {
            const scaledR = tl / pTL.arcKScale; const startAngle = PI + PI * 0.5 * (1.0 - pTL.arcFrac) * 0.5; const sweepAngle = PI * 0.5 * pTL.arcFrac;
            const midAngle = startAngle + sweepAngle * 0.5; const drift = tl * (1.0 - 1.0 / pTL.arcKScale);
            const cx = tl + cos(midAngle) * drift; const cy = tl + sin(midAngle) * drift; const arc = getArcAsCubic(cx, cy, scaledR, startAngle, sweepAngle);
            moveTo(0, tl - pTL.offsetV); cubicTo(0 + pTL.bezierV.p1.y * tl, tl - pTL.bezierV.p1.x * tl, 0 + pTL.bezierV.p2.y * tl, tl - pTL.bezierV.p2.x * tl, arc.xStart, arc.yStart);
            cubicTo(arc.cp1x, arc.cp1y, arc.cp2x, arc.cp2y, arc.xEnd, arc.yEnd); cubicTo(tl - pTL.bezierH.p2.x * tl, 0 + pTL.bezierH.p2.y * tl, tl - pTL.bezierH.p1.x * tl, 0 + pTL.bezierH.p1.y * tl, tl - max(pTL.bezierH.p0.x * tl, pTL.offsetH), 0);
        } else { moveTo(0, 0); }
        lineTo(width - tr - (pTR ? -pTR.offsetH : 0), 0);
        if (tr > 0 && pTR) {
            const scaledR = tr / pTR.arcKScale; const startAngle = -PI * 0.5 + PI * 0.5 * (1.0 - pTR.arcFrac) * 0.5; const sweepAngle = PI * 0.5 * pTR.arcFrac;
            const midAngle = startAngle + sweepAngle * 0.5; const drift = tr * (1.0 - 1.0 / pTR.arcKScale);
            const cx = (width - tr) + cos(midAngle) * drift; const cy = tr + sin(midAngle) * drift; const arc = getArcAsCubic(cx, cy, scaledR, startAngle, sweepAngle);
            cubicTo((width - tr) + pTR.bezierH.p1.x * tr, 0 + pTR.bezierH.p1.y * tr, (width - tr) + pTR.bezierH.p2.x * tr, 0 + pTR.bezierH.p2.y * tr, arc.xStart, arc.yStart);
            cubicTo(arc.cp1x, arc.cp1y, arc.cp2x, arc.cp2y, arc.xEnd, arc.yEnd); cubicTo(width - pTR.bezierV.p2.y * tr, tr - pTR.bezierV.p2.x * tr, width - pTR.bezierV.p1.y * tr, tr - pTR.bezierV.p1.x * tr, width, tr - max(pTR.bezierV.p0.x * tr, pTR.offsetV));
        } else { lineTo(width, 0); }
        lineTo(width, height - br - (pBR ? -pBR.offsetV : 0));
        if (br > 0 && pBR) {
            const scaledR = br / pBR.arcKScale; const startAngle = 0 + PI * 0.5 * (1.0 - pBR.arcFrac) * 0.5; const sweepAngle = PI * 0.5 * pBR.arcFrac;
            const midAngle = startAngle + sweepAngle * 0.5; const drift = br * (1.0 - 1.0 / pBR.arcKScale);
            const cx = (width - br) + cos(midAngle) * drift; const cy = (height - br) + sin(midAngle) * drift; const arc = getArcAsCubic(cx, cy, scaledR, startAngle, sweepAngle);
            cubicTo(width - pBR.bezierV.p1.y * br, (height - br) + pBR.bezierV.p1.x * br, width - pBR.bezierV.p2.y * br, (height - br) + pBR.bezierV.p2.x * br, arc.xStart, arc.yStart);
            cubicTo(arc.cp1x, arc.cp1y, arc.cp2x, arc.cp2y, arc.xEnd, arc.yEnd); cubicTo((width - br) + pBR.bezierH.p2.x * br, height - pBR.bezierH.p2.y * br, (width - br) + pBR.bezierH.p1.x * br, height - pBR.bezierH.p1.y * br, (width - br) + max(pBR.bezierH.p0.x * br, pBR.offsetH), height);
        } else { lineTo(width, height); }
        lineTo(bl + (pBL ? -pBL.offsetH : 0), height);
        if (bl > 0 && pBL) {
            const scaledR = bl / pBL.arcKScale; const startAngle = PI * 0.5 + PI * 0.5 * (1.0 - pBL.arcFrac) * 0.5; const sweepAngle = PI * 0.5 * pBL.arcFrac;
            const midAngle = startAngle + sweepAngle * 0.5; const drift = bl * (1.0 - 1.0 / pBL.arcKScale);
            const cx = bl + cos(midAngle) * drift; const cy = (height - bl) + sin(midAngle) * drift; const arc = getArcAsCubic(cx, cy, scaledR, startAngle, sweepAngle);
            cubicTo(bl - pBL.bezierH.p1.x * bl, height - pBL.bezierH.p1.y * bl, bl - pBL.bezierH.p2.x * bl, height - pBL.bezierH.p2.y * bl, arc.xStart, arc.yStart);
            cubicTo(arc.cp1x, arc.cp1y, arc.cp2x, arc.cp2y, arc.xEnd, arc.yEnd); cubicTo(0 + pBL.bezierV.p2.y * bl, (height - bl) + pBL.bezierV.p2.x * bl, 0 + pBL.bezierV.p1.y * bl, (height - bl) + pBL.bezierV.p1.x * bl, 0, (height - bl) + max(pBL.bezierV.p0.x * bl, pBL.offsetV));
        } else { lineTo(0, height); }
        d += "Z"; return d;
    }

    // ==========================================
    // 3. 布局应用函数
    // ==========================================
    function applyPaths() {
        const vw = window.innerWidth / 100;
        const regularRadius = 1.5 * vw;
        // 列表项伪增高开关
        const ENABLE_LIST_EXTENSION = false;

        // 主容器裁切
        if (tvmContainer) {
            const rect = tvmContainer.getBoundingClientRect();
            const w = Math.round(rect.width);
            const h = Math.round(rect.height);
            if (w > 0) {
                tvmContainer.style.clipPath = `path('${getSmoothRectPath(w, h, 1.5 * vw)}')`;
            }
        }

        const configs = [
            { sel: '.station-name-bg .bg', r: 2.1 * vw },
            { sel: '.button-by-distance .bg', r: { tl: regularRadius, bl: regularRadius, tr: 0, br: 0 } },
            { sel: '.button-by-fare .bg', r: { tr: regularRadius, br: regularRadius, tl: 0, bl: 0 } },
            { sel: '.button-language .bg', r: regularRadius },
            { sel: '.button-top-up .bg', r: regularRadius },
            { sel: '.button-system-map .bg', r: regularRadius },
            { sel: '.button-line-item[data-line="1"] .bg', r: { tl: regularRadius, bl: 0, tr: regularRadius, br: 0 } },
            { sel: '.button-line-item[data-line="10"] .bg', r: { tl: 0, bl: regularRadius, tr: 0, br: regularRadius } },
            { sel: '.button-line-item:not([data-line="1"]):not([data-line="10"]) .bg', r: 0 },
            { sel: '#langModal > svg > .bg', r: 3 * vw },
            { sel: '.lang-item[data-lang="en-US"] .bg', r: { tl: regularRadius, tr: regularRadius, bl: 0, br: 0 }, type: 'list-top' },
            { sel: '.lang-item[data-lang="zh-TW"] .bg', r: { bl: regularRadius, br: regularRadius, tl: 0, tr: 0 }, type: 'list-bottom' },
            { sel: '.lang-item:not([data-lang="en-US"]):not([data-lang="zh-TW"]) .bg', r: 0, type: 'list-mid' },
            { sel: '.lang-confirm .bg', r: regularRadius },
            { sel: '.lang-cancel .bg', r: regularRadius },
            { sel: ".button-reset-by-distance .bg", r: regularRadius },
            { sel: ".button-pay-by-distance .bg", r: regularRadius },
            { sel: ".btn-counter .bg", r: regularRadius },
            { sel: ".btn-quick .bg", r: regularRadius }
        ];

        configs.forEach(cfg => {
            document.querySelectorAll(cfg.sel).forEach(pathEl => {
                const container = pathEl.closest('.station-name-bg, .tvm-button, .lang-modal, .btn-quick, .btn-counter, .lang-item');
                const svg = pathEl.closest('svg');

                if (!container || !svg) return;

                const rect = container.getBoundingClientRect();
                // 物理容器尺寸
                let w = Math.round(rect.width);
                let h = Math.round(rect.height);

                if (w < 1 || h < 1) return;

                let drawH = h;

                if (ENABLE_LIST_EXTENSION) {
                    if (cfg.type === 'list-top') { drawH = h * 2.5; }
                    else if (cfg.type === 'list-bottom') { drawH = h * 2.5; }
                }

                // ==========================================
                // 核心修复逻辑：安全缩进 (Safety Inset)
                // ==========================================

                // 1. 设置 ViewBox 与容器 1:1 对齐 (最稳健的设置)
                svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
                svg.style.width = '100%';
                svg.style.height = '100%';
                svg.style.left = '0';
                svg.style.top = '0';
                svg.style.transform = 'none';
                svg.style.overflow = 'visible';

                // 2. 缩减算法输入
                // 我们告诉算法：画一个比容器小 1px 的图形
                // 这样生成的路径坐标最大值只有 w-1, h-1
                // 缩减量 (Inset Amount)
                const inset = 1;

                // 针对 drawH (绘制高度) 和 w (绘制宽度) 进行缩减
                const safeW = w - (inset * 2);
                const safeH = drawH - (inset * 2);

                // 3. 生成“小一号”的路径
                // 如果尺寸太小就不画了，防止算法报错
                if (safeW <= 0 || safeH <= 0) return;

                pathEl.setAttribute('d', getSmoothRectPath(safeW, safeH, cfg.r));

                // 4. 将“小一号”的路径居中放置
                // 通过 transform 把它往右下挪 1px
                // 结果：左边空 1px，右边空 1px，图形绝对安全
                pathEl.setAttribute('transform', `translate(${inset}, ${inset})`);

                // 5. 视觉补偿（可选）
                // 因为图形变小了 2px，为了不露出缝隙，我们可以加一个描边把这 2px 补回来
                // 描边是向外扩散的，且不容易被裁切
                const computedColor = window.getComputedStyle(pathEl).fill;
                // 只有当填充色有效时才加描边
                if (computedColor !== 'none') {
                    pathEl.style.stroke = computedColor;
                    pathEl.style.strokeWidth = `${inset * 2}px`; // 补回缩减的尺寸
                    pathEl.style.strokeLinejoin = 'round'; // 圆角连接
                }

                pathEl.style.shapeRendering = 'geometricPrecision';
            });
        });
    }

    // ==========================================
    // 4. 界面切换
    // ==========================================
    function switchScreen(nextMode) {
        // 1. 如果目标模式就是当前模式，不做任何事
        if (!nextMode || nextMode === currentMode) return;

        // 2. 【核心修复】打断：立即清除上一个切换任务的计时器，防止它乱删类名
        if (switchTimer) {
            clearTimeout(switchTimer);
            switchTimer = null;
        }

        const from = currentMode === 'distance' ? screenByDistance : screenByAmount;
        const to = nextMode === 'distance' ? screenByDistance : screenByAmount;
        const isGoingToAmount = (nextMode === 'fare');

        // 3. 立即重置两个屏幕的过渡状态
        // 移除 screen-transition 让它们立即停止在当前位置
        [screenByDistance, screenByAmount].forEach(el => {
            el.classList.remove('screen-transition');
        });

        // 4. 【关键】强制重绘 (Force Reflow)
        // 这一步让浏览器“意识到”过渡类名被删了，从而瞬间停止动画
        void to.offsetWidth;

        // 5. 设置新屏幕的起点
        // 如果新屏幕不在中间，就把它瞬移到侧边准备进场
        if (!to.classList.contains('screen-center')) {
            to.classList.remove('screen-left', 'screen-right');
            to.classList.add(isGoingToAmount ? 'screen-right' : 'screen-left');
        }

        // 再次重绘，确保起点位置被锁定
        void to.offsetWidth;

        // 6. 重新应用过渡类并开始新动画
        from.classList.add('screen-transition');
        to.classList.add('screen-transition');

        // 执行位移
        from.classList.remove('screen-center');
        from.classList.add(isGoingToAmount ? 'screen-left' : 'screen-right');

        to.classList.remove('screen-left', 'screen-right');
        to.classList.add('screen-center');

        // 7. 设置新的计时器，在动画结束后清理
        switchTimer = setTimeout(() => {
            [screenByDistance, screenByAmount].forEach(el => {
                el.classList.remove('screen-transition');
            });
            applyPaths(); // 动画完全结束后更新 Diamond 圆角
            switchTimer = null; // 清空变量
        }, 550); // 时间要略大于 CSS 里的 0.5s

        currentMode = nextMode;
    }

    // ==========================================
    // 5. 点击互斥逻辑
    // ==========================================
    function setupExclusiveButtons(selector, defaultColor = '#2e6aff') {
        document.querySelectorAll(selector).forEach(btn => {
            btn.addEventListener('click', () => {
                const group = btn.closest('#ticketModeGroup') || btn.closest('.tvm-panel-left') || btn.closest('.lang-options-list');
                const groupButtons = group ? group.querySelectorAll('.tvm-button, .lang-item') : [btn];

                groupButtons.forEach(b => {
                    b.classList.remove('active');
                    const path = b.querySelector('path.bg');
                    const span = b.querySelector('span');
                    if (path) path.style.fill = '#e8e8e8';
                    if (span) span.style.color = 'black';
                });

                btn.classList.add('active');
                const path = btn.querySelector('path.bg');
                const span = btn.querySelector('span');
                const activeColor = btn.getAttribute('data-active-color') || defaultColor;

                if (path) path.style.fill = activeColor;
                if (span) span.style.color = 'white';

                if (btn.dataset.mode) switchScreen(btn.dataset.mode);
            });
        });
    }

    // ==========================================
    // 6. 语言模态框逻辑
    // ==========================================
    async function loadTranslations(langCode) {
        try {
            const response = await fetch(`./resources/translations/${langCode}.json`);
            if (!response.ok) return;
            translations = await response.json();
            document.querySelectorAll('[data-i18n]').forEach(el => {
                const key = el.getAttribute('data-i18n');
                if (translations[key]) el.textContent = translations[key];
            });
            document.documentElement.lang = langCode;
            requestAnimationFrame(applyPaths);
        } catch (e) { console.warn("Translation load failed."); }
    }

    // 设置临时高亮（点击列表项但还没按“确定”）
    function setTempHighlight(langCode) {
        tempLang = langCode;
        document.querySelectorAll('.lang-item').forEach(item => {
            const isActive = (item.dataset.lang === langCode);
            item.classList.toggle('active', isActive);
            const path = item.querySelector('path.bg');
            const span = item.querySelector('span');
            if (path) path.style.fill = isActive ? '#2e6aff' : '#e8e8e8';
            if (span) span.style.color = isActive ? 'white' : 'black';
        });
    }

    function openModal() {
        originalLang = document.documentElement.lang || "zh-CN";
        tempLang = originalLang;
        setTempHighlight(originalLang);

        setTimeout(() => {
            langOverlay.classList.add('active');
            applyPaths();
        }, 10);

        requestAnimationFrame(() => {
            applyPaths();
        });
    }

    function closeModal(apply = false) {
        if (apply) {
            loadTranslations(tempLang);
        } else {
            // 取消，还原原本高亮
            setTempHighlight(originalLang);
        }
        langOverlay.classList.remove('active');
        tvmContainer.classList.remove('lang-mode');
    }

    function switchLanguage(langCode) {
        document.documentElement.lang = langCode;
        // 手动处理高亮同步
        document.querySelectorAll('.lang-item').forEach(item => {
            const isActive = (item.dataset.lang === langCode);
            item.classList.toggle('active', isActive);
            const path = item.querySelector('path.bg');
            const span = item.querySelector('span');
            if (path) path.style.fill = isActive ? '#2e6aff' : '#e8e8e8';
            if (span) span.style.color = isActive ? 'white' : 'black';
        });

        // 此处应调用 fetch 翻译文件的逻辑
        requestAnimationFrame(applyPaths);
    }

    // ==========================================
    // 7. 初始化与事件绑定
    // ==========================================
    function init() {
        // 1. 显式设置屏幕初始状态（基于我们之前的绝对定位逻辑）
        screenByDistance.classList.add('screen-center');
        screenByAmount.classList.add('screen-right');

        // 2. 清除可能残留的行内样式
        screenByDistance.style.visibility = '';
        screenByAmount.style.visibility = '';

        // 3. 初始化互斥逻辑绑定
        setupExclusiveButtons('.tvm-panel-left .tvm-button');
        setupExclusiveButtons('#ticketModeGroup .tvm-button');

        // 默认选中“按里程购票”
        const defaultModeBtn = document.querySelector('.button-by-distance');
        if (defaultModeBtn) {
            defaultModeBtn.click();
        }

        // 默认选中左侧菜单的第一项（线网总图）
        const defaultMenuBtn = document.querySelector('.button-system-map');
        if (defaultMenuBtn) {
            defaultMenuBtn.click();
        }

        if (langBtn) {
            langBtn.addEventListener('click', openModal);
        }

        // 【新增：绑定弹窗内的确定和取消按钮】
        if (confirmBtn) {
            confirmBtn.addEventListener('click', () => closeModal(true));
        }
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => closeModal(false));
        }

        document.addEventListener('keydown', (e) => {
            // 检查是否按下了 ESC 键
            if (e.key === 'Escape' || e.key === 'Esc') {
                // 检查模态框是否正处于激活状态
                if (langOverlay && langOverlay.classList.contains('active')) {
                    console.log("检测到 ESC 键，正在关闭弹窗...");
                    closeModal(false); // 执行取消逻辑
                }
            }
        });

        // 【新增：绑定语言选项的临时高亮逻辑】
        document.querySelectorAll('.lang-item').forEach(item => {
            item.addEventListener('click', () => {
                setTempHighlight(item.dataset.lang);
            });
        });

        // 5. 其他常规初始化
        loadTranslations(originalLang);
        updateDateTime();
        setInterval(updateDateTime, 1000);

        window.addEventListener('resize', applyPaths);
        requestAnimationFrame(applyPaths);
    }

    init();
});
