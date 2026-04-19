import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { z, AnyZodObject } from 'zod';

// Extend Express Request to include user payload from JWT
export interface AuthRequest extends Request {
    user?: { id: string; role: string };
}

// JWT Authentication Middleware
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
        return res.status(401).json({ error: 'Access denied. No authentication token provided.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_jwt_secret_here') as { id: string; role: string };
        req.user = decoded;
        next();
    } catch (ex) {
        res.status(401).json({ error: 'Invalid token.' });
    }
};

// Zod Validation Middleware
export const validate = (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
    try {
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    } catch (error: any) {
        return res.status(400).json({ errors: error.errors });
    }
};
