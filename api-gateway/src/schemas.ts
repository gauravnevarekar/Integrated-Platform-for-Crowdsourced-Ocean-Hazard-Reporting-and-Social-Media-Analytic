import { z } from 'zod';

export const createReportSchema = z.object({
    body: z.object({
        category_id: z.number().int().positive(),
        title: z.string().min(5).max(255),
        description: z.string().optional(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
        severity: z.enum(['low', 'medium', 'high', 'critical']),
        photos: z.array(z.string().url()).optional()
    })
});

export const getReportsSchema = z.object({
    query: z.object({
        category_id: z.string().regex(/^\d+$/).optional(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        start_date: z.string().datetime().optional(),
        end_date: z.string().datetime().optional(),
        min_lat: z.string().optional(),
        min_lng: z.string().optional(),
        max_lat: z.string().optional(),
        max_lng: z.string().optional(),
    })
});

export const corroborateReportSchema = z.object({
    body: z.object({
        is_confirming: z.boolean(),
        comments: z.string().optional(),
        latitude: z.number().min(-90).max(90),
        longitude: z.number().min(-180).max(180),
    })
});

export const nearbyHazardsSchema = z.object({
    query: z.object({
        lat: z.string().refine((val) => !isNaN(parseFloat(val)), "Invalid latitude"),
        lng: z.string().refine((val) => !isNaN(parseFloat(val)), "Invalid longitude"),
        radius_km: z.string().regex(/^\d+(\.\d+)?$/).default('10'),
    })
});
