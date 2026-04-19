export type Severity = 'low' | 'medium' | 'high' | 'critical';

export interface HazardReport {
    id: string;
    category_name: string;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
    severity: Severity;
    status: string;
    trust_score: number;
    photos: string[];
    reported_at: string;
    reporter_name?: string;
    source: 'crowdsourced' | 'social_media';
}

export interface HazardCluster {
    id: string;
    latitude: number;
    longitude: number;
    point_count: number;
    most_severe: Severity;
}
