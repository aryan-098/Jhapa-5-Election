const express = require('express');
const cors = require('cors');
const compression = require('compression');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data', 'votes.json');
const ADMIN_PASSWORD = '@Notjhapa5admin';

// ===== PERFORMANCE: Max SSE connections =====
const MAX_SSE_CLIENTS = 1000;

// ===== Middleware =====
app.use(cors());
app.use(compression({
    filter: (req, res) => {
        if (req.path === '/api/stream' || req.headers['accept'] === 'text/event-stream') {
            return false; // Don't compress SSE
        }
        return compression.filter(req, res);
    }
})); // Gzip all responses (~70% smaller)
app.use(express.json());

// Static files with aggressive caching (images, CSS, JS)
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: '1h',         // Cache static assets for 1 hour
    etag: true,           // Enable ETag for cache validation
    lastModified: true    // Enable Last-Modified headers
}));

// ===== SSE clients =====
let sseClients = [];

// ===== Data cache (avoid reading file on every request) =====
let cachedData = null;
let cacheTimestamp = 0;

function readVoteData() {
    // Use cache if fresh (< 1 second old)
    const now = Date.now();
    if (cachedData && (now - cacheTimestamp) < 1000) {
        return cachedData;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    cachedData = JSON.parse(raw);
    cacheTimestamp = now;
    return cachedData;
}

function writeVoteData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf-8');
    // Update cache immediately
    cachedData = data;
    cacheTimestamp = Date.now();
}

// Broadcast to all SSE clients
function broadcast(data) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    sseClients.forEach(client => {
        try {
            client.res.write(payload);
            if (client.res.flush) client.res.flush();
        } catch (e) {
            // Client disconnected, will be cleaned up
        }
    });
}

// ===== API Routes =====

// GET /api/candidates
app.get('/api/candidates', (req, res) => {
    try {
        const data = readVoteData();
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: 'Failed to read vote data' });
    }
});

// POST /api/votes — password-protected vote update
app.post('/api/votes', (req, res) => {
    const { password, votes } = req.body;

    if (password !== ADMIN_PASSWORD) {
        return res.status(401).json({ error: 'Invalid password' });
    }

    if (!votes || !Array.isArray(votes)) {
        return res.status(400).json({ error: 'Invalid votes data' });
    }

    try {
        const data = readVoteData();

        votes.forEach(update => {
            const candidate = data.candidates.find(c => c.id === update.id);
            if (candidate && typeof update.votes === 'number' && update.votes >= 0) {
                candidate.votes = update.votes;
            }
        });

        data.lastUpdated = new Date().toISOString();
        writeVoteData(data);

        // Broadcast to all live viewers
        broadcast(data);

        console.log(`📤 Votes updated — ${sseClients.length} viewers notified`);
        res.json({ success: true, data });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update votes' });
    }
});

// GET /api/stream — SSE live updates
app.get('/api/stream', (req, res) => {
    // Enforce connection limit
    if (sseClients.length >= MAX_SSE_CLIENTS) {
        res.status(503).json({ error: 'Too many connections, try again later' });
        return;
    }

    res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no',           // Disable nginx buffering (if behind proxy)
        'Access-Control-Allow-Origin': '*'
    });

    // Send initial data
    const data = readVoteData();
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (res.flush) res.flush();

    // Add client
    const clientId = Date.now() + Math.random();
    const client = { id: clientId, res };
    sseClients.push(client);

    console.log(`👁️  Viewer connected (${sseClients.length} total)`);

    // Heartbeat every 25s
    const heartbeat = setInterval(() => {
        try {
            res.write(': heartbeat\n\n');
            if (res.flush) res.flush();
        } catch (e) {
            clearInterval(heartbeat);
        }
    }, 25000);

    // Auto-disconnect after 2 hours to prevent stale connections
    const autoDisconnect = setTimeout(() => {
        clearInterval(heartbeat);
        sseClients = sseClients.filter(c => c.id !== clientId);
        try { res.end(); } catch (e) { }
    }, 2 * 60 * 60 * 1000);

    // Cleanup on disconnect
    req.on('close', () => {
        clearInterval(heartbeat);
        clearTimeout(autoDisconnect);
        sseClients = sseClients.filter(c => c.id !== clientId);
        console.log(`👁️  Viewer disconnected (${sseClients.length} remaining)`);
    });
});

// GET /api/stats — monitor connections (for you)
app.get('/api/stats', (req, res) => {
    res.json({
        activeViewers: sseClients.length,
        maxViewers: MAX_SSE_CLIENTS,
        uptime: process.uptime(),
        memoryMB: Math.round(process.memoryUsage().heapUsed / 1024 / 1024)
    });
});

// ===== Start server =====
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🗳️  Jhapa-5 Live Election Server`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Public Dashboard: http://localhost:${PORT}`);
    console.log(`🔐 Admin Panel:      http://localhost:${PORT}/admin.html`);
    console.log(`📈 Server Stats:     http://localhost:${PORT}/api/stats`);
    console.log(`👥 Max SSE Clients:  ${MAX_SSE_CLIENTS}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
});
