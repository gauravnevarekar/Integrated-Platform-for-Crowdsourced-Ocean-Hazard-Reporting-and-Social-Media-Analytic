import express, { Request, Response, NextFunction } from 'express';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import { pool } from './db';
import { authenticate, validate, AuthRequest } from './middleware';
import {
    createReportSchema,
    getReportsSchema,
    corroborateReportSchema,
    nearbyHazardsSchema
} from './schemas';

// In-memory mock database for local testing without Docker/PostgreSQL
let mockReports: any[] = [
    {
        id: '1', category_id: 1, category_name: 'Oil Spill', title: 'Large slick spotted', description: 'Viscous fluid moving east',
        latitude: 10.5, longitude: 65.2, severity: 'critical', status: 'verified', trust_score: 95.5,
        photos: [], reported_at: new Date().toISOString(), reporter_name: 'Marine Guard', source: 'crowdsourced'
    },
    {
        id: '2', category_id: 2, category_name: 'Rough Seas', title: '10m swells reported', description: 'Container ship reporting major waves',
        latitude: -20.0, longitude: 85.0, severity: 'high', status: 'reported', trust_score: 70.0,
        photos: [], reported_at: new Date().toISOString(), reporter_name: 'User123', source: 'social_media'
    }
];

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws/live' });

// ==========================================
// WebSocket Setup
// ==========================================
const clients = new Set<WebSocket>();

wss.on('connection', (ws) => {
    clients.add(ws);
    console.log('New WebSocket client connected');
    ws.on('close', () => clients.delete(ws));
});

const broadcast = (data: any) => {
    const message = JSON.stringify(data);
    for (const client of clients) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(message);
        }
    }
};

// ==========================================
// API Routes
// ==========================================

// Root Route check
app.get('/', (req: Request, res: Response) => {
    res.json({ message: "Ocean Hazard API is running!", version: "1.0.0" });
});

// 1. POST /api/reports - Submit new hazard report
app.post('/api/reports', authenticate, validate(createReportSchema), async (req: AuthRequest, res: Response) => {
    try {
        const { category_id, title, description, latitude, longitude, severity, photos } = req.body;
        const user_id = req.user?.id;

        // Mocking the database insert temporarily since DB is inaccessible
        const newReport = {
            id: Math.floor(Math.random() * 1000).toString(),
            user_id,
            category_id,
            category_name: category_id === 1 ? 'Oil Spill' : category_id === 2 ? 'Rough Seas' : 'Other',
            title,
            description,
            latitude,
            longitude,
            severity,
            photos: photos || [],
            status: 'reported',
            trust_score: 50.0,
            reported_at: new Date().toISOString(),
            reporter_name: 'Anonymous Reporter',
            source: 'crowdsourced'
        };

        mockReports.unshift(newReport); // Add to our mock DB

        // Broadcast new report to all WebSocket clients instantly
        broadcast({ type: 'NEW_HAZARD', payload: newReport });

        res.status(201).json(newReport);
    } catch (error) {
        console.error('Error creating report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 2. GET /api/reports - Get all reports with optional filters
app.get('/api/reports', validate(getReportsSchema), async (req: Request, res: Response) => {
    try {
        const { category_id, severity, start_date, end_date, min_lat, min_lng, max_lat, max_lng } = req.query;

        let filtered = [...mockReports];

        if (category_id) {
            filtered = filtered.filter(r => r.category_id.toString() === category_id);
        }
        if (severity) {
            filtered = filtered.filter(r => r.severity === severity);
        }

        res.json(filtered.slice(0, 100));
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 3. GET /api/reports/:id - Get single report with details
app.get('/api/reports/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const report = mockReports.find(r => r.id === id);

        if (!report) return res.status(404).json({ error: 'Report not found' });

        res.json(report);
    } catch (error) {
        console.error('Error fetching particular report:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 4. POST /api/reports/:id/corroborate - Corroborate existing report
app.post('/api/reports/:id/corroborate', authenticate, validate(corroborateReportSchema), async (req: AuthRequest, res: Response) => {
    try {
        const { id } = req.params;
        const { is_confirming, comments, latitude, longitude } = req.body;

        const reportIndex = mockReports.findIndex(r => r.id === id);
        if (reportIndex === -1) return res.status(404).json({ error: 'Report not found' });

        const scoreChange = is_confirming ? 5.0 : -5.0;
        mockReports[reportIndex].trust_score += scoreChange;

        const corroboration = { user_id: req.user?.id, is_confirming, comments, latitude, longitude };

        // Notify clients about updated report score
        broadcast({ type: 'REPORT_CORROBORATED', payload: { report_id: id, corroboration } });

        res.status(201).json(corroboration);
    } catch (error: any) {
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// 5. GET /api/hazards/nearby - Get hazards within distance using PostGIS
app.get('/api/hazards/nearby', validate(nearbyHazardsSchema), async (req: Request, res: Response) => {
    try {
        const { lat, lng, radius_km } = req.query;

        // Simple mock distance filter (box check instead of Haversine for brevity)
        const latNum = parseFloat(lat as string);
        const lngNum = parseFloat(lng as string);
        const radiusDeg = parseFloat(radius_km as string || '10') / 111.0; // rough approx 1 deg = 111km

        const nearby = mockReports.filter(r => {
            return Math.abs(r.latitude - latNum) <= radiusDeg && Math.abs(r.longitude - lngNum) <= radiusDeg;
        });

        res.json(nearby);
    } catch (error) {
        console.error('Error in nearby query:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

// ==========================================
// Error Handling
// ==========================================
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
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
