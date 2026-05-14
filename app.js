/* ═══════════════════════════════════════════
   A QUOTE A DAY — app.js v2
   Bug fixes: dirClose, dirBackdrop, arrow keys,
   progress dots, arrow buttons, search,
   masthead scroll shrink, staggered animations
═══════════════════════════════════════════ */

const CONFIG = {
    REPO: "AndrewVeda/a-quote-a-day",
    DIR:  "quotes",
};

let DB          = [];
let currentView = [];
let deckIdx     = 0;
let currentTab  = 'all';

/* ─── MASTHEAD SCROLL ─── */
const mastheadEl = document.getElementById('masthead');
window.addEventListener('scroll', () => {
    mastheadEl.classList.toggle('scrolled', window.scrollY > 20);
}, { passive: true });

/* ─── DATELINE ─── */
document.getElementById('mastDateline').innerText =
    new Date().toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }).toUpperCase();

/* ─── KEYBOARD ENGINE ─── */
document.addEventListener('keydown', e => {
    const overlay = document.getElementById('deckOverlay');
    if (!overlay.classList.contains('open')) return;
    if (e.key === 'Escape')       closeDeck();
    if (e.key === 'ArrowRight')   moveDeck(1);
    if (e.key === 'ArrowLeft')    moveDeck(-1);
});

function moveDeck(dir) {
    const next = deckIdx + dir;
    if (next < 0 || next >= currentView.length) return;
    deckIdx = next;
    updateDeckPosition();
}

/* ─── CLOSE DECK ─── */
function closeDeck() {
    document.getElementById('deckOverlay').classList.remove('open');
    document.body.style.overflow = '';
    window.history.replaceState(null, null, window.location.pathname);
}

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded', async () => {
    await fetchArchive();
    setupNavigation();
    setupSwipeEngine();
    setupSearch();

    const urlParams = new URLSearchParams(window.location.search);
    const quoteId   = urlParams.get('id');
    if (quoteId) jumpToQuote(quoteId);
});

/* ─── FETCH & PARSE ─── */
async function fetchArchive() {
    try {
        const response = await fetch(
            `https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.DIR}`
        );
        if (!response.ok) throw new Error('Network error');

        const files  = await response.json();
        const mdFiles = files.filter(f => f.name.endsWith('.md'));

        const promises = mdFiles.map(async (file, i) => {
            try {
                const raw = await fetch(file.download_url).then(r => r.text());
                return parseEntry(raw, file.name, i + 1);
            } catch { return null; }
        });

        DB = (await Promise.all(promises)).filter(Boolean);
        DB.sort((a, b) => b.date - a.date);

        if (DB.length === 0) throw new Error('Empty archive');

        document.getElementById('mastCount').innerText = `${DB.length} Quotes`;
        renderGrid(DB);

    } catch (err) {
        console.error('Archive fetch error:', err);
        document.getElementById('mainContent').innerHTML = `
            <div class="empty-state">
                <p>⚠️ Could not load archive.</p>
                <button onclick="location.reload()" style="margin-top:20px; padding:10px 24px; border:1px solid var(--gold-border); border-radius:30px; cursor:pointer; font-family:var(--sans); background:var(--gold); color:white;">
                    Retry
                </button>
            </div>`;
    } finally {
        const loader = document.getElementById('loader');
        if (loader) loader.style.display = 'none';
    }
}

function parseEntry(md, filename, fallbackId) {
    const match = md.match(/---([\s\S]*?)---/);
    if (!match) return null;

    const data = {};
    match[1].split('\n').forEach(line => {
        const i = line.indexOf(':');
        if (i !== -1) {
            data[line.substring(0,i).trim()] = line.substring(i+1).trim();
        }
    });

    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    return {
        id:          data.id || fallbackId,
        quote:       data.quote       || 'Text missing.',
        author:      data.author      || 'Unknown',
        contributor: data.contributor || 'Anonymous',
        department:  data.department  || 'English',
        about:       data.what_it_means_to_me || data.about || '',
        date:        new Date(dateMatch ? dateMatch[1] : 0),
        dateStr:     dateMatch ? dateMatch[1] : 'Unknown',
    };
}

/* ─── RENDER GRID ─── */
function renderGrid(quotes) {
    currentView = quotes;
    const container = document.getElementById('mainContent');

    if (quotes.length === 0) {
        container.innerHTML = '<p class="no-results">No quotes found.</p>';
        return;
    }

    container.innerHTML = '';

    const header = document.createElement('div');
    header.className = 'results-header';
    header.textContent = `${quotes.length} ${quotes.length === 1 ? 'Quote' : 'Quotes'}`;
    container.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'col-grid';

    quotes.forEach((q, i) => {
        const card = document.createElement('div');
        card.className = 'q-card';
        card.style.animationDelay = `${Math.min(i * 40, 400)}ms`;
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
        card.setAttribute('aria-label', `Quote by ${q.author}`);
        const snippet = q.about && q.about.trim()
            ? `<div class="q-card-reflection">"${q.about.length > 120 ? q.about.slice(0, 117) + '…' : q.about}"<span class="q-card-reflection-by"> — ${q.contributor}</span></div>`
            : '';
        card.innerHTML = `
            <div class="q-card-num">No. ${q.id} · ${q.dateStr}</div>
            <div class="q-card-text">"${q.quote}"</div>
            ${snippet}
            <div class="q-card-footer">
                <div>
                    <div class="q-card-author">${q.author} <span class="q-card-contrib">via ${q.contributor}</span></div>
                    <div class="q-card-dept">${q.department}</div>
                </div>
                <div class="q-card-arrow">→</div>
            </div>
        `;
        card.addEventListener('click', () => openDeck(quotes, i));
        card.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') openDeck(quotes, i);
        });
        grid.appendChild(card);
    });

    container.appendChild(grid);
}

/* ─── SEARCH ─── */
function setupSearch() {
    const input = document.getElementById('searchInput');
    let debounceTimer;

    input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const q = input.value.trim().toLowerCase();
            if (!q) {
                // Restore current tab view
                if (currentTab === 'all') renderGrid(DB);
                return;
            }
            const filtered = DB.filter(item =>
                item.quote.toLowerCase().includes(q) ||
                item.author.toLowerCase().includes(q) ||
                item.contributor.toLowerCase().includes(q) ||
                item.department.toLowerCase().includes(q) ||
                item.about.toLowerCase().includes(q)
            );
            renderGrid(filtered);
        }, 220);
    });
}

/* ─── NAVIGATION ─── */
function setupNavigation() {
    /* Tab buttons */
    document.querySelectorAll('.quick-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const tab = btn.dataset.tab;
            currentTab = tab;
            document.getElementById('searchInput').value = '';
            document.querySelectorAll('.quick-tab').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            if (tab === 'all') {
                renderGrid(DB);
            } else if (tab === 'departments') {
                renderGroupedGrid('department');
            } else {
                openDirectory(tab);
            }
        });
    });

    /* Deck close */
    document.getElementById('deckClose').addEventListener('click', closeDeck);

    /* Arrow buttons */
    document.getElementById('arrowPrev').addEventListener('click', () => moveDeck(-1));
    document.getElementById('arrowNext').addEventListener('click', () => moveDeck(1));

    /* Directory panel close */
    document.getElementById('dirClose').addEventListener('click', closeDirectory);
    document.getElementById('dirBackdrop').addEventListener('click', closeDirectory);

    /* Click outside deck (on overlay bg) to close */
    document.getElementById('deckOverlay').addEventListener('click', e => {
        if (e.target === e.currentTarget) closeDeck();
    });
}

/* ─── OPEN DECK ─── */
function openDeck(quotes, startIdx) {
    currentView = quotes;
    deckIdx     = startIdx;

    const track = document.getElementById('deckTrack');
    track.innerHTML = '';

    quotes.forEach((q, i) => {
        const slide = document.createElement('div');
        slide.className = 'deck-slide';

        const hasReflection = q.about && q.about.trim().length > 0;

        slide.innerHTML = `
            <div class="deck-layout">

                <!-- LEFT: quote + reflection (70%) -->
                <div class="deck-left">
                    <div class="deck-card" id="export-target-${i}">
                        <div class="dc-body">
                            <div class="dc-kicker">Quote #${q.id} · ${q.dateStr}</div>
                            <div class="dc-quote">"${q.quote}"</div>
                            <div class="dc-byline">
                                <div class="dc-author">${q.author}</div>
                                <div class="dc-role">Quoted Author</div>
                            </div>
                            <div class="dc-envelope">
                                <div class="dc-env-label">Contributed by</div>
                                <div class="dc-contrib-name">${q.contributor}</div>
                                <div class="dc-contrib-dept">${q.department}</div>
                                ${hasReflection ? `
                                    <div class="dc-divider"></div>
                                    <div class="dc-reflection-label">What this means to me</div>
                                    <div class="dc-reflection">"${q.about}"</div>
                                ` : ''}
                            </div>
                        </div>
                        <div class="deck-action-row no-export">
                            <button class="btn-premium-action btn-whatsapp" onclick="shareToWhatsApp(${i})">
                                📲 Share
                            </button>
                            <a href="https://andrewveda.github.io/a-quote-a-day/submissions"
                               target="_blank" rel="noopener"
                               class="btn-premium-action btn-submit">
                                ✏️ Add a Quote
                            </a>
                        </div>
                    </div>
                </div>

                <!-- RIGHT: giscus comments (30%) -->
                <div class="deck-right">
                    <div class="deck-comments-label">Discussion</div>
                    <div class="giscus-mount" id="giscus-slot-${i}"></div>
                </div>

            </div>
        `;
        track.appendChild(slide);
    });

    document.getElementById('deckOverlay').classList.add('open');
    document.body.style.overflow = 'hidden';
    updateDeckPosition(false);
}

/* ─── UPDATE DECK POSITION ─── */
function updateDeckPosition(animate = true) {
    const track = document.getElementById('deckTrack');
    if (!track) return;

    track.style.transition = animate
        ? 'transform 0.42s cubic-bezier(0.23, 1, 0.32, 1)'
        : 'none';
    track.style.transform = `translateX(${-deckIdx * 100}vw)`;

    /* Counter */
    const counter = document.getElementById('deckCounter');
    if (counter) counter.innerText = `${deckIdx + 1} / ${currentView.length}`;

    /* Arrow states */
    const prev = document.getElementById('arrowPrev');
    const next = document.getElementById('arrowNext');
    if (prev) prev.disabled = deckIdx === 0;
    if (next) next.disabled = deckIdx === currentView.length - 1;

    /* Progress dots — show max 7 dots */
    const wrap  = document.getElementById('deckProgressWrap');
    if (wrap) {
        const total  = currentView.length;
        const maxDots = Math.min(total, 7);
        wrap.innerHTML = '';
        for (let i = 0; i < maxDots; i++) {
            const dot = document.createElement('div');
            dot.className = 'progress-dot' + (i === Math.min(deckIdx, maxDots - 1) ? ' active' : '');
            wrap.appendChild(dot);
        }
    }

    /* URL sync */
    const q = currentView[deckIdx];
    if (q) window.history.replaceState(null, null, `?id=${q.id}`);

    /* Lazy-load giscus */
    loadGiscus(deckIdx);
}

/* ─── RENDER GROUPED GRID (Departments) ─── */
function renderGroupedGrid(groupBy) {
    const container = document.getElementById('mainContent');
    container.innerHTML = '';

    const index = {};
    DB.forEach(item => {
        const key = item[groupBy] || 'Other';
        if (!index[key]) index[key] = [];
        index[key].push(item);
    });

    const sorted = Object.keys(index).sort((a, b) => index[b].length - index[a].length);

    sorted.forEach(groupName => {
        const groupQuotes = index[groupName];

        const section = document.createElement('div');
        section.className = 'dept-section';

        const heading = document.createElement('div');
        heading.className = 'dept-heading';
        heading.innerHTML = `
            <span class="dept-heading-name">${groupName}</span>
            <span class="dept-heading-count">${groupQuotes.length} ${groupQuotes.length === 1 ? 'quote' : 'quotes'}</span>
        `;
        section.appendChild(heading);

        const grid = document.createElement('div');
        grid.className = 'col-grid';

        groupQuotes.forEach((q, i) => {
            const card = document.createElement('div');
            card.className = 'q-card';
            card.style.animationDelay = `${Math.min(i * 30, 300)}ms`;
            card.setAttribute('tabindex', '0');
            card.setAttribute('role', 'button');
            card.setAttribute('aria-label', `Quote by ${q.author}`);

            const snippet = q.about && q.about.trim()
                ? `<div class="q-card-reflection">"${q.about.length > 120 ? q.about.slice(0, 117) + '…' : q.about}"<span class="q-card-reflection-by"> — ${q.contributor}</span></div>`
                : '';

            card.innerHTML = `
                <div class="q-card-num">No. ${q.id} · ${q.dateStr}</div>
                <div class="q-card-text">"${q.quote}"</div>
                ${snippet}
                <div class="q-card-footer">
                    <div>
                        <div class="q-card-author">${q.author} <span class="q-card-contrib">via ${q.contributor}</span></div>
                        <div class="q-card-dept">${q.department}</div>
                    </div>
                    <div class="q-card-arrow">→</div>
                </div>
            `;
            card.addEventListener('click', () => openDeck(groupQuotes, i));
            card.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') openDeck(groupQuotes, i);
            });
            grid.appendChild(card);
        });

        section.appendChild(grid);
        container.appendChild(section);
    });
}


function openDirectory(category) {
    const list = document.getElementById('dirList');
    list.innerHTML = '';

    const titleMap = { authors: 'Authors', contributors: 'Contributors', departments: 'Departments' };
    document.getElementById('dirTitle').innerText = titleMap[category] || 'Directory';

    const index = {};
    DB.forEach(item => {
        const key = category === 'authors'
            ? item.author
            : category === 'contributors'
                ? item.contributor
                : item.department;
        if (!index[key]) index[key] = [];
        index[key].push(item);
    });

    Object.keys(index)
        .sort((a, b) => index[b].length - index[a].length)
        .forEach(name => {
            const row = document.createElement('div');
            row.className = 'dir-row';
            row.innerHTML = `
                <span class="dir-row-name">${name}</span>
                <span class="dir-badge">${index[name].length}</span>
            `;
            row.addEventListener('click', () => {
                renderGrid(index[name]);
                closeDirectory();
            });
            list.appendChild(row);
        });

    document.getElementById('dirPanel').classList.add('open');
    document.getElementById('dirBackdrop').classList.add('open');
}

function closeDirectory() {
    document.getElementById('dirPanel').classList.remove('open');
    document.getElementById('dirBackdrop').classList.remove('open');
}

/* ─── GISCUS ─── */
function loadGiscus(idx) {
    const slot = document.getElementById(`giscus-slot-${idx}`);
    if (!slot || slot.innerHTML !== '') return;

    const q = currentView[idx];
    const script = document.createElement('script');
    script.src = 'https://giscus.app/client.js';
    script.setAttribute('data-repo',        CONFIG.REPO);
    script.setAttribute('data-repo-id',     'R_kgDORI8-yw');
    script.setAttribute('data-category',    'General');
    script.setAttribute('data-category-id', 'DIC_kwDORI8-y84C1-Jq');
    script.setAttribute('data-mapping',     'specific');
    script.setAttribute('data-term',        `${q.author} — ${q.contributor}`);
    script.setAttribute('data-theme',       'preferred_color_scheme');
    script.crossOrigin = 'anonymous';
    script.async = true;
    slot.appendChild(script);
}

/* ─── SWIPE ENGINE ─── */
function setupSwipeEngine() {
    let startX = 0, dist = 0, dragging = false;
    const area = document.getElementById('deckOverlay');

    area.addEventListener('touchstart', e => {
        startX   = e.touches[0].clientX;
        dragging = true;
    }, { passive: true });

    area.addEventListener('touchmove', e => {
        if (!dragging) return;
        dist = e.touches[0].clientX - startX;
    }, { passive: true });

    area.addEventListener('touchend', () => {
        if (!dragging) return;
        dragging = false;
        if (Math.abs(dist) > 70) {
            moveDeck(dist < 0 ? 1 : -1);
        }
        dist = 0;
    });
}

/* ─── JUMP TO QUOTE ─── */
function jumpToQuote(id) {
    const found = DB.find(q => String(q.id) === String(id));
    if (found) openDeck(DB, DB.indexOf(found));
}

/* ─── SHARE / EXPORT ─── */
async function shareToWhatsApp(idx) {
    const q   = currentView[idx];
    const btn = event.currentTarget;
    const orig = btn.innerHTML;
    btn.innerHTML = 'Processing…';
    btn.disabled  = true;

    try {
        const stage = document.getElementById('share-canvas-container');

        const qLen = q.quote.length;
        const quoteFontSize  = qLen < 50  ? 72 : qLen < 80  ? 60 : qLen < 120 ? 48 : qLen < 180 ? 38 : 30;
        const authorFontSize = q.author.length < 15 ? 52 : q.author.length < 25 ? 42 : 34;
        const contribFontSize = q.contributor.length < 12 ? 48 : q.contributor.length < 20 ? 38 : 30;
        const reflFontSize   = q.about && q.about.length < 100 ? 24 : 19;

        const reflectionBlock = q.about ? `
            <div style="
                background: #1c1a16;
                padding: 28px 40px;
                flex-shrink: 0;
            ">
                <div style="
                    font-family: 'DM Mono', monospace;
                    font-size: 9px;
                    letter-spacing: 4px;
                    text-transform: uppercase;
                    color: #b8913a;
                    margin-bottom: 12px;
                ">What this means to me</div>
                <div style="
                    font-family: 'Cormorant Garamond', Georgia, serif;
                    font-style: italic;
                    font-size: ${reflFontSize}px;
                    line-height: 1.45;
                    color: #f5f0e8;
                ">"${q.about}"</div>
            </div>` : '';

        stage.innerHTML = `
            <div id="poster-export" style="
                width: 540px;
                height: 960px;
                background: #f5f0e8;
                display: flex;
                flex-direction: column;
                overflow: hidden;
                position: relative;
                font-family: 'Cormorant Garamond', Georgia, serif;
            ">
                <!-- Ghost watermark -->
                <div style="
                    position: absolute;
                    top: -30px; left: -10px;
                    font-size: 500px;
                    line-height: 1;
                    color: rgba(184,145,58,0.07);
                    font-style: italic;
                    pointer-events: none;
                    z-index: 0;
                ">"</div>

                <!-- TOP BAR -->
                <div style="
                    background: #1c1a16;
                    padding: 16px 32px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-shrink: 0;
                    z-index: 1;
                ">
                    <div style="font-family:'Cormorant Garamond',Georgia,serif; font-style:italic; font-size:22px; color:#b8913a;">A Quote A Day</div>
                    <div style="font-family:'DM Mono',monospace; font-size:9px; letter-spacing:3px; text-transform:uppercase; color:rgba(184,145,58,0.5);">SRM VEC · No.${q.id}</div>
                </div>

                <!-- GOLD RULE -->
                <div style="height:5px; background:linear-gradient(to right,#6b3f10,#b8913a,#e8c97a,#b8913a,#6b3f10); flex-shrink:0; z-index:1;"></div>

                <!-- QUOTE BLOCK -->
                <div style="
                    flex: 1;
                    padding: 32px 36px 24px;
                    display: flex;
                    flex-direction: column;
                    justify-content: center;
                    z-index: 1;
                    overflow: hidden;
                ">
                    <div style="
                        font-size: ${quoteFontSize}px;
                        font-style: italic;
                        font-weight: 600;
                        line-height: 1.2;
                        color: #1c1a16;
                        letter-spacing: -0.5px;
                        margin-bottom: 28px;
                    ">"${q.quote}"</div>

                    <!-- Author row -->
                    <div style="
                        border-top: 2px solid #b8913a;
                        padding-top: 20px;
                        display: flex;
                        flex-direction: column;
                        gap: 4px;
                    ">
                        <div style="
                            font-size: ${authorFontSize}px;
                            font-weight: 700;
                            line-height: 1.05;
                            color: #1c1a16;
                            letter-spacing: -0.5px;
                        ">${q.author}</div>
                        <div style="font-family:'DM Mono',monospace; font-size:9px; letter-spacing:3px; text-transform:uppercase; color:#b8913a; margin-top:4px;">Quoted Author</div>
                    </div>
                </div>

                <!-- CONTRIBUTOR BAND -->
                <div style="
                    background: #b8913a;
                    padding: 20px 36px;
                    flex-shrink: 0;
                    z-index: 1;
                ">
                    <div style="font-family:'DM Mono',monospace; font-size:8px; letter-spacing:4px; text-transform:uppercase; color:rgba(28,26,22,0.6); margin-bottom:6px;">Shared by</div>
                    <div style="
                        font-size: ${contribFontSize}px;
                        font-weight: 700;
                        font-style: italic;
                        line-height: 1.05;
                        color: #1c1a16;
                        letter-spacing: -0.5px;
                    ">${q.contributor}</div>
                    <div style="font-family:'DM Mono',monospace; font-size:9px; letter-spacing:2px; text-transform:uppercase; color:rgba(28,26,22,0.55); margin-top:5px;">${q.department}</div>
                </div>

                <!-- REFLECTION BLOCK -->
                ${reflectionBlock}

                <!-- BOTTOM BAR -->
                <div style="
                    background: #1c1a16;
                    padding: 12px 32px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    flex-shrink: 0;
                    z-index: 1;
                ">
                    <div style="font-family:'DM Mono',monospace; font-size:8px; letter-spacing:2px; text-transform:uppercase; color:rgba(184,145,58,0.45);">andrewveda.github.io/a-quote-a-day</div>
                    <div style="font-family:'DM Mono',monospace; font-size:8px; letter-spacing:1px; color:rgba(184,145,58,0.3);">${q.dateStr}</div>
                </div>
            </div>`;

        const canvas = await html2canvas(document.getElementById('poster-export'), { scale: 2, useCORS: true });
        const blob   = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.92));
        const file   = new File([blob], `Quote-${q.id}.jpg`, { type: 'image/jpeg' });

        const shareUrl = `https://andrewveda.github.io/a-quote-a-day/?id=${q.id}`;
        const shareText = `Check out this reflection by ${q.contributor.toUpperCase()} on SRM VEC English Archive.\n\n🔗 ${shareUrl}`;

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                text: shareText,
            });
        } else {
            const link  = document.createElement('a');
            link.href   = canvas.toDataURL();
            link.download = `Quote-${q.id}.jpg`;
            link.click();
        }
    } catch (e) {
        if (e.name !== 'AbortError') console.error('Share error:', e);
    }

    btn.innerHTML = orig;
    btn.disabled  = false;
}
