import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../.env') });

import authRoutes from './routes/auth.js';
import opportunityRoutes from './routes/opportunities.js';
import settingsRoutes from './routes/settings.js';
import { initWorker } from './worker/index.js';
import { runIngestion } from './services/ingestionService.js';

const app = express();
const port = process.env.PORT || 4000;

// Proper CORS configuration for Production
app.use(cors({
    origin: (origin, callback) => {
        const allowed = [process.env.FRONTEND_URL, 'http://localhost:3000'].filter(Boolean);
        if (!origin || allowed.some(a => origin.startsWith(a!)) || origin.endsWith('.pages.dev')) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Cookie', 'X-Requested-With']
}));

app.use(helmet());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/opportunities', opportunityRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/ingest', async (req, res) => {
    try {
        const force = req.query.force === 'true';
        const limit = parseInt(req.query.limit as string) || 50;
        await runIngestion({ force, limit });
        res.json({ success: true, message: `Ingestion started (Force: ${force}, Limit: ${limit})` });
    } catch (error) {
        res.status(500).json({ error: 'Failed to trigger ingestion' });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
    console.log(`Server is running at http://localhost:${port}`);
    initWorker();
});

export default app;
