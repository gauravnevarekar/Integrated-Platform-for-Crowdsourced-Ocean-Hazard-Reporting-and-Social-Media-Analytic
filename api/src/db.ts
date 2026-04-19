import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

// Connects to PostgreSQL. Make sure to set DATABASE_URL in a .env file
export const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/ocean_hazards',
});
