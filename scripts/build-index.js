// scripts/build-index.js
// Runs in CI — reads every quotes/*.json (except index.json itself),
// validates, sorts by date ascending, auto-assigns IDs, writes quotes/index.json.

const fs   = require('fs');
const path = require('path');

const QUOTES_DIR = path.join(__dirname, '..', 'quotes');
const OUT_FILE   = path.join(QUOTES_DIR, 'index.json');

const REQUIRED_FIELDS = ['quote', 'author', 'contributor', 'department'];

const files = fs.readdirSync(QUOTES_DIR)
    .filter(f => f.endsWith('.json') && f !== 'index.json' && f !== 'TEMPLATE.json');

const quotes = [];
const errors = [];

for (const file of files) {
    const filePath = path.join(QUOTES_DIR, file);
    let data;

    // Parse JSON
    try {
        data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {
        errors.push(`❌ ${file}: invalid JSON — ${e.message}`);
        continue;
    }

    // Validate required fields
    const missing = REQUIRED_FIELDS.filter(f => !data[f] || !data[f].trim());
    if (missing.length) {
        errors.push(`❌ ${file}: missing fields — ${missing.join(', ')}`);
        continue;
    }

    // Extract date from filename (YYYY-MM-DD-anything.json)
    const dateMatch = file.match(/^(\d{4}-\d{2}-\d{2})/);
    const date = dateMatch ? dateMatch[1] : null;

    if (!date) {
        errors.push(`❌ ${file}: filename must start with YYYY-MM-DD (e.g. 2024-03-15-sunanda-vk.json)`);
        continue;
    }

    quotes.push({
        quote:       data.quote.trim(),
        author:      data.author.trim(),
        contributor: data.contributor.trim(),
        department:  data.department.trim(),
        about:       (data.about || '').trim(),
        date,
    });
}

// Sort oldest → newest so IDs are stable over time
quotes.sort((a, b) => new Date(a.date) - new Date(b.date));

// Auto-assign IDs — students never touch this
quotes.forEach((q, i) => q.id = i + 1);

// Reverse for the site (newest first)
quotes.reverse();

// Write output
fs.writeFileSync(OUT_FILE, JSON.stringify(quotes, null, 2));

// Report
console.log(`✅ Built index.json — ${quotes.length} quotes from ${files.length} files`);
if (errors.length) {
    console.log('\nErrors (files skipped):');
    errors.forEach(e => console.log(' ', e));
}
