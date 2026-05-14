/**
 * ARCHIVE ENGINE v3.0
 * Deep-Linking, Relational Indexing & Physics-Based UI
 */

const CONFIG = {
    REPO: "AndrewVeda/a-quote-a-day",
    DIR: "quotes",
    PER_PAGE: 20
};

let DB = []; // The Master Archive
let currentView = [];
let deckIdx = 0;

/* ─── INITIALIZATION ─── */
document.addEventListener('DOMContentLoaded', async () => {
    initApp();
});

async function initApp() {
    await fetchArchive();
    setupNavigation();
    setupSwipeEngine();
    
    // ROUTING: Check if user arrived via a unique link (e.g., ?id=102)
    const urlParams = new URLSearchParams(window.location.search);
    const quoteId = urlParams.get('id');
    if (quoteId) {
        jumpToQuote(quoteId);
    }
}

/* ─── DATA ARCHITECTURE ─── */
async function fetchArchive() {
    const loader = document.getElementById('loader');
    try {
        const response = await fetch(`https://api.github.com/repos/${CONFIG.REPO}/contents/${CONFIG.DIR}`);
        const files = await response.json();
        
        const promises = files.filter(f => f.name.endsWith('.md')).map(async (file, index) => {
            const raw = await fetch(file.download_url).then(r => r.text());
            return parseEntry(raw, file.name, index + 1); // ID starts from 1
        });

        DB = (await Promise.all(promises)).filter(Boolean);
        DB.sort((a, b) => b.date - a.date); // Newest first for main feed
        
        renderGrid(DB);
        updateMetadata();
    } catch (err) {
        console.error("Archive Fetch Error:", err);
        document.getElementById('mainContent').innerHTML = `<div class="empty-state">Unable to sync with the academic archive. Check your connection.</div>`;
    } finally {
        if(loader) loader.style.display = 'none';
    }
}

function parseEntry(md, filename, fallbackId) {
    const match = md.match(/---([\s\S]*?)---/);
    if (!match) return null;

    const data = {};
    match[1].split('\n').forEach(line => {
        const i = line.indexOf(':');
        if (i !== -1) {
            const key = line.substring(0, i).trim();
            const val = line.substring(i + 1).trim();
            data[key] = val;
        }
    });

    const dateMatch = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    // Unique ID is either the filename date + index or a provided field
    const id = data.id || fallbackId; 

    return {
        id: id,
        quote: data.quote || "Text missing.",
        author: data.author || "Unknown",
        contributor: data.contributor || "Student",
        department: data.department || "English",
        about: data.what_it_means_to_me || data.about || "",
        date: new Date(dateMatch ? dateMatch[1] : 0),
        dateStr: dateMatch ? dateMatch[1] : 'Unknown'
    };
}

/* ─── THE DIRECTORY PANEL (Relational Logic) ─── */
function openDirectory(category) {
    const panel = document.getElementById('dirPanel');
    const list = document.getElementById('dirList');
    const title = document.getElementById('dirTitle');
    
    title.innerText = category.charAt(0).toUpperCase() + category.slice(1);
    list.innerHTML = '';

    // Grouping Logic
    const index = {};
    DB.forEach(item => {
        const key = (category === 'authors') ? item.author : 
                    (category === 'contributors') ? item.contributor : item.department;
        if (!index[key]) index[key] = [];
        index[key].push(item);
    });

    // Sort by count (Premium UX: most active people first)
    Object.keys(index).sort((a, b) => index[b].length - index[a].length).forEach(name => {
        const row = document.createElement('div');
        row.className = 'dir-row';
        row.innerHTML = `<strong>${name}</strong> <span class="dir-badge">${index[name].length}</span>`;
        row.onclick = () => {
            renderGrid(index[name], `Archive: ${name}`);
            closeDirectory();
        };
        list.appendChild(row);
    });

    panel.classList.add('open');
    document.getElementById('dirBackdrop').style.display = 'block';
}

/* ─── DECK VIEWER & DEEP LINKING ─── */
function openDeck(quotes, startIdx) {
    currentView = quotes;
    deckIdx = startIdx;
    const track = document.getElementById('deckTrack');
    track.innerHTML = '';

    quotes.forEach((q, i) => {
        const slide = document.createElement('div');
        slide.className = 'deck-slide';
        slide.innerHTML = `
            <div class="deck-card" id="export-target-${i}">
                <div class="dc-kicker">Wisdom Archive #${q.id}</div>
                <div class="dc-quote">"${q.quote}"</div>
                <div class="dc-author">${q.author}</div>
                <div class="dc-role">Source Author</div>
                
                <div class="dc-contrib-envelope">
                    <div class="dc-contrib-label">Curated By</div>
                    <div class="dc-contrib-name">${q.contributor}</div>
                    <div class="dc-contrib-dept">English Department · ${q.department}</div>
                    ${q.about ? `<div class="dc-reflection">${q.about}</div>` : ''}
                </div>

                <div class="action-grid no-export">
                    <button class="btn-premium wa" onclick="shareToWhatsApp(${i})">📲 Send via WhatsApp</button>
                    <button class="btn-premium" onclick="copyDeepLink('${q.id}')">🔗 Copy Link</button>
                </div>
                
                <div class="giscus-mount" id="giscus-slot-${i}" style="margin-top:30px;"></div>
            </div>
        `;
        track.appendChild(slide);
    });

    document.getElementById('deckOverlay').classList.add('open');
    updateDeckPosition(false);
}

function updateDeckPosition(animate = true) {
    const track = document.getElementById('deckTrack');
    track.style.transition = animate ? 'transform 0.4s var(--spring)' : 'none';
    track.style.transform = `translateX(${-deckIdx * 100}vw)`;
    
    document.getElementById('deckCounter').innerText = `${String(deckIdx + 1).padStart(2, '0')} / ${String(currentView.length).padStart(2, '0')}`;
    
    // Update URL without refreshing the page
    const q = currentView[deckIdx];
    window.history.replaceState(null, null, `?id=${q.id}`);
    
    loadGiscus(deckIdx);
}

async function shareToWhatsApp(idx) {
    const q = currentView[idx];
    const target = document.getElementById(`export-target-${idx}`);
    const btn = event.target;
    btn.innerText = "Formatting for WhatsApp...";

    try {
        const canvas = await html2canvas(target, {
            scale: 2,
            useCORS: true,
            ignoreElements: (el) => el.classList.contains('no-export'),
            backgroundColor: "#faf7f2"
        });

        const blob = await new Promise(res => canvas.toBlob(res, 'image/png'));
        const file = new File([blob], `quote-${q.id}.png`, { type: 'image/png' });
        const shareLink = `${window.location.origin}${window.location.pathname}?id=${q.id}`;

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: `Wisdom from ${q.author}`,
                text: `Check out this reflection by ${q.contributor} on SRM VEC English Archive.\n\n🔗 ${shareLink}`
            });
        } else {
            // Fallback for desktops
            const dataUrl = canvas.toDataURL();
            const link = document.createElement('a');
            link.href = dataUrl;
            link.download = `Quote-${q.id}.png`;
            link.click();
        }
    } catch (err) {
        console.error("Export Error:", err);
    } finally {
        btn.innerText = "📲 Send via WhatsApp";
    }
}

/* ─── UTILITIES ─── */
function loadGiscus(idx) {
    const slot = document.getElementById(`giscus-slot-${idx}`);
    if (slot.innerHTML !== '') return;

    const script = document.createElement('script');
    script.src = "https://giscus.app/client.js";
    script.setAttribute("data-repo", CONFIG.REPO);
    script.setAttribute("data-repo-id", "R_kgDORI8-yw");
    script.setAttribute("data-category", "General");
    script.setAttribute("data-category-id", "DIC_kwDORI8-y84C1-Jq");
    script.setAttribute("data-mapping", "specific");
    script.setAttribute("data-term", `Quote-ID-${currentView[idx].id}`);
    script.setAttribute("data-theme", "preferred_color_scheme");
    script.crossOrigin = "anonymous";
    script.async = true;
    slot.appendChild(script);
}

function jumpToQuote(id) {
    const found = DB.find(q => String(q.id) === String(id));
    if (found) {
        openDeck(DB, DB.indexOf(found));
    }
}

function setupSwipeEngine() {
    let startX = 0;
    let dist = 0;
    const area = document.getElementById('deckOverlay');

    area.addEventListener('touchstart', e => { startX = e.touches[0].clientX; }, {passive: true});
    area.addEventListener('touchmove', e => { dist = e.touches[0].clientX - startX; }, {passive: true});
    area.addEventListener('touchend', () => {
        if (Math.abs(dist) > 80) {
            if (dist < 0 && deckIdx < currentView.length - 1) deckIdx++;
            if (dist > 0 && deckIdx > 0) deckIdx--;
            updateDeckPosition();
        }
        dist = 0;
    });
}

function setupNavigation() {
    document.querySelectorAll('.quick-tab').forEach(btn => {
        btn.onclick = () => {
            const tab = btn.dataset.tab;
            if (tab === 'all') {
                renderGrid(DB);
                setActiveTab(btn);
            } else {
                openDirectory(tab);
            }
        };
    });
    
    document.getElementById('deckClose').onclick = () => {
        document.getElementById('deckOverlay').classList.remove('open');
        document.body.style.overflow = 'auto';
        window.history.replaceState(null, null, window.location.pathname);
    };
    
    document.getElementById('dirClose').onclick = closeDirectory;
    document.getElementById('dirBackdrop').onclick = closeDirectory;
}

function renderGrid(quotes, titleLabel = null) {
    const container = document.getElementById('mainContent');
    container.innerHTML = '<div class="col-grid"></div>';
    const grid = container.querySelector('.col-grid');

    quotes.forEach((q, i) => {
        const card = document.createElement('div');
        card.className = 'q-card';
        card.innerHTML = `
            <div class="q-card-text">"${q.quote}"</div>
            <div class="q-card-author">— ${q.author}</div>
            <div class="q-card-meta">${q.contributor} · ${q.department}</div>
        `;
        card.onclick = () => openDeck(quotes, i);
        grid.appendChild(card);
    });
}

function closeDirectory() {
    document.getElementById('dirPanel').classList.remove('open');
    document.getElementById('dirBackdrop').style.display = 'none';
}

function copyDeepLink(id) {
    const link = `${window.location.origin}${window.location.pathname}?id=${id}`;
    navigator.clipboard.writeText(link);
    alert("Unique archive link copied to clipboard!");
}
