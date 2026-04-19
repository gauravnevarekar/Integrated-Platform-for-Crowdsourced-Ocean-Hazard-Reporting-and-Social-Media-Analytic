"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const ws_1 = require("ws");
const cors_1 = __importDefault(require("cors"));
const db_1 = require("./db");
const middleware_1 = require("./middleware");
const schemas_1 = require("./schemas");
const app = (0, express_1.default)();
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const server = (0, http_1.createServer)(app);
const wss = new ws_1.WebSocketServer({ server, path: '/ws/live' });
// ==========================================
// WebSocket Setup
// ==========================================
const clients = new Set();
wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('New WebSocket client connected');
    ws.on('close', () => clients.delete(ws));
});
const broadcast = (data) => {
    const message = JSON.stringify(data);
    for (const client of clients) {
        if (client.readyState === ws_1.WebSocket.OPEN) {
            client.send(message);
        }
    }
};
// ==========================================
// API Routes
// ==========================================
// 1. POST /api/reports - Submit new hazard report
app.post('/api/reports', middleware_1.authenticate, (0, middleware_1.validate)(schemas_1.createReportSchema), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const client = yield db_1.pool.connect();
    try {
        const { category_id, title, description, latitude, longitude, severity, photos } = req.body;
        const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        yield client.query('BEGIN');
        const insertQuery = `
            INSERT INTO hazard_reports (
                user_id, category_id, title, description,
                location, latitude, longitude, severity, photos
            ) VALUES (
                $1, $2, $3, $4,
                ST_SetSRID(ST_MakePoint($5, $6), 4326), $7, $8, $9, $10
            ) RETURNING *;
        `;
        const values = [
            user_id, category_id, title, description,
            longitude, latitude, latitude, longitude, severity, JSON.stringify(photos || [])
        ];
        const { rows } = yield client.query(insertQuery, values);
        const newReport = rows[0];
        yield client.query('COMMIT');
        // Broadcast new report to all WebSocket clients instantly
        broadcast({ type: 'NEW_HAZARD', payload: newReport });
        res.status(201).json(newReport);
    }
    catch (error) {
        yield client.query('ROLLBACK');
        console.error('Error creating report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
    finally {
        client.release();
    }
}));
// 2. GET /api/reports - Get all reports with optional filters
app.get('/api/reports', (0, middleware_1.validate)(schemas_1.getReportsSchema), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { category_id, severity, start_date, end_date, min_lat, min_lng, max_lat, max_lng } = req.query;
        let query = 'SELECT * FROM hazard_reports WHERE 1=1';
        const values = [];
        let paramIndex = 1;
        if (category_id) {
            query += ` AND category_id = $${paramIndex++}`;
            values.push(category_id);
        }
        if (severity) {
            query += ` AND severity = $${paramIndex++}`;
            values.push(severity);
        }
        if (start_date && end_date) {
            query += ` AND reported_at BETWEEN $${paramIndex++} AND $${paramIndex++}`;
            values.push(start_date, end_date);
        }
        // PostGIS bounding box coordinates query
        if (min_lat && min_lng && max_lat && max_lng) {
            query += ` AND location && ST_MakeEnvelope($${paramIndex++}, $${paramIndex++}, $${paramIndex++}, $${paramIndex++}, 4326)`;
            values.push(min_lng, min_lat, max_lng, max_lat);
        }
        query += ' ORDER BY reported_at DESC LIMIT 100';
        const { rows } = yield db_1.pool.query(query, values);
        res.json(rows);
    }
    catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}));
// 3. GET /api/reports/:id - Get single report with details
app.get('/api/reports/:id', (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const query = `
            SELECT hr.*, c.name as category_name, u.full_name as reporter_name
            FROM hazard_reports hr
            LEFT JOIN hazard_categories c ON hr.category_id = c.id
            LEFT JOIN users u ON hr.user_id = u.id
            WHERE hr.id = $1
        `;
        const { rows } = yield db_1.pool.query(query, [id]);
        if (rows.length === 0)
            return res.status(404).json({ error: 'Report not found' });
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Error fetching particular report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}));
// 4. POST /api/reports/:id/corroborate - Corroborate existing report
app.post('/api/reports/:id/corroborate', middleware_1.authenticate, (0, middleware_1.validate)(schemas_1.corroborateReportSchema), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const client = yield db_1.pool.connect();
    try {
        const { id } = req.params;
        const { is_confirming, comments, latitude, longitude } = req.body;
        const user_id = (_a = req.user) === null || _a === void 0 ? void 0 : _a.id;
        yield client.query('BEGIN');
        // Insert Corroboration
        const insertQuery = `
            INSERT INTO report_corroborations (
                report_id, user_id, is_confirming, comments, location
            ) VALUES (
                $1, $2, $3, $4, ST_SetSRID(ST_MakePoint($5, $6), 4326)
            ) RETURNING *;
        `;
        const values = [id, user_id, is_confirming, comments, longitude, latitude];
        const { rows } = yield client.query(insertQuery, values);
        // Adjust Trust Score based on corroboration
        const updateTrustQuery = `
            UPDATE hazard_reports 
            SET trust_score = trust_score + $1 
            WHERE id = $2 RETURNING *;
        `;
        const scoreChange = is_confirming ? 5.0 : -5.0;
        yield client.query(updateTrustQuery, [scoreChange, id]);
        yield client.query('COMMIT');
        // Notify clients about updated report score
        broadcast({ type: 'REPORT_CORROBORATED', payload: { report_id: id, corroboration: rows[0] } });
        res.status(201).json(rows[0]);
    }
    catch (error) {
        yield client.query('ROLLBACK');
        if (error.code === '23505') { // Postgres Unique Violation code
            return res.status(400).json({ error: 'You have already corroborated this report' });
        }
        res.status(500).json({ error: 'Internal Server Error' });
    }
    finally {
        client.release();
    }
}));
// 5. GET /api/hazards/nearby - Get hazards within distance using PostGIS
app.get('/api/hazards/nearby', (0, middleware_1.validate)(schemas_1.nearbyHazardsSchema), (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { lat, lng, radius_km } = req.query;
        // ST_DWithin accurately calculates meters over Earth's geography.
        const query = `
            SELECT *, 
            ST_Distance(
                location::geography, 
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography
            ) / 1000 AS distance_km
            FROM hazard_reports
            WHERE ST_DWithin(
                location::geography,
                ST_SetSRID(ST_MakePoint($1, $2), 4326)::geography,
                $3 * 1000 -- Multiply by 1000 because ST_DWithin takes meters on geographies
            )
            ORDER BY distance_km ASC;
        `;
        const { rows } = yield db_1.pool.query(query, [lng, lat, radius_km]);
        res.json(rows);
    }
    catch (error) {
        console.error('Error in nearby query:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}));
// ==========================================
// Error Handling
// ==========================================
app.use((err, req, res, next) => {
    console.error('Unhandled Error:', err.stack);
    res.status(500).json({ error: 'An unexpected error occurred!' });
});
// ==========================================
// Start Server
// ==========================================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`WebSocket endpoint active at ws://localhost:${PORT}/ws/live`);
});
