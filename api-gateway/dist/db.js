"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.pool = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
// Connects to PostgreSQL. Make sure to set DATABASE_URL in a .env file
exports.pool = new pg_1.Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://username:password@localhost:5432/ocean_hazards',
});
