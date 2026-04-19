"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nearbyHazardsSchema = exports.corroborateReportSchema = exports.getReportsSchema = exports.createReportSchema = void 0;
const zod_1 = require("zod");
exports.createReportSchema = zod_1.z.object({
    body: zod_1.z.object({
        category_id: zod_1.z.number().int().positive(),
        title: zod_1.z.string().min(5).max(255),
        description: zod_1.z.string().optional(),
        latitude: zod_1.z.number().min(-90).max(90),
        longitude: zod_1.z.number().min(-180).max(180),
        severity: zod_1.z.enum(['low', 'medium', 'high', 'critical']),
        photos: zod_1.z.array(zod_1.z.string().url()).optional()
    })
});
exports.getReportsSchema = zod_1.z.object({
    query: zod_1.z.object({
        category_id: zod_1.z.string().regex(/^\d+$/).optional(),
        severity: zod_1.z.enum(['low', 'medium', 'high', 'critical']).optional(),
        start_date: zod_1.z.string().datetime().optional(),
        end_date: zod_1.z.string().datetime().optional(),
        min_lat: zod_1.z.string().optional(),
        min_lng: zod_1.z.string().optional(),
        max_lat: zod_1.z.string().optional(),
        max_lng: zod_1.z.string().optional(),
    })
});
exports.corroborateReportSchema = zod_1.z.object({
    body: zod_1.z.object({
        is_confirming: zod_1.z.boolean(),
        comments: zod_1.z.string().optional(),
        latitude: zod_1.z.number().min(-90).max(90),
        longitude: zod_1.z.number().min(-180).max(180),
    })
});
exports.nearbyHazardsSchema = zod_1.z.object({
    query: zod_1.z.object({
        lat: zod_1.z.string().refine((val) => !isNaN(parseFloat(val)), "Invalid latitude"),
        lng: zod_1.z.string().refine((val) => !isNaN(parseFloat(val)), "Invalid longitude"),
        radius_km: zod_1.z.string().regex(/^\d+(\.\d+)?$/).default('10'),
    })
});
