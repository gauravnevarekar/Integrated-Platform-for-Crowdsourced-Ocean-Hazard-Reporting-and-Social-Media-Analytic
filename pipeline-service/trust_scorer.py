from dataclasses import dataclass
from datetime import datetime
from typing import List

@dataclass
class Report:
    reporter_id: str
    is_verified: bool
    report_count: int
    account_age_days: int
    hazard_type: str
    lat: float
    lon: float
    timestamp: datetime
    nlp_confidence: float  # 0.0 to 1.0

@dataclass
class TrustScoreResult:
    final_score: float
    classification: str
    breakdown: dict

class TrustScorer:
    def __init__(self):
        pass

    def calculate_trust_score(
        self,
        report: Report,
        recent_corroborating_reports: List[Report],
        noaa_weather_match: bool = False,
        copernicus_data_match: bool = False
    ) -> TrustScoreResult:
        """
        Calculates a trust score from 0 to 100 based on reporter credibility,
        corroborating reports, NLP confidence, and environmental consistency.
        
        Args:
            report (Report): The incoming report to score.
            recent_corroborating_reports (List[Report]): List of other reports of the same 
                hazard type within 10km and 2 hours.
            noaa_weather_match (bool): True if NOAA weather data confirms storm/rough seas.
            copernicus_data_match (bool): True if Copernicus satellite data confirms the hazard.
            
        Returns:
            TrustScoreResult: A dataclass containing the final score, classification, and breakdown.
        """
        score_breakdown = {}
        total_score = 0.0

        # 1. Reporter credibility (25 points max)
        credibility_score = 0
        if report.is_verified:
            credibility_score += 15
        if report.report_count > 10:
            credibility_score += 5
        if report.account_age_days > 180: # roughly 6 months
            credibility_score += 5
        
        score_breakdown['reporter_credibility'] = credibility_score
        total_score += credibility_score

        # 2. Corroboration (30 points max)
        # Each additional report of the same hazard type adds 10 points
        corroboration_score = min(30, len(recent_corroborating_reports) * 10)
        score_breakdown['corroboration'] = corroboration_score
        total_score += corroboration_score

        # 3. NLP confidence (20 points max)
        # nlp_confidence is scaled from 0-1 to 0-20
        nlp_score = min(20.0, max(0.0, report.nlp_confidence * 20.0))
        score_breakdown['nlp_confidence'] = round(nlp_score, 2)
        total_score += nlp_score

        # 4. Environmental consistency (25 points max)
        env_score = 0
        if noaa_weather_match:
            env_score += 15
        if copernicus_data_match:
            env_score += 10
            
        score_breakdown['environmental_consistency'] = env_score
        total_score += env_score

        # Ensure total doesn't exceed 100
        total_score = min(100.0, total_score)

        # Classify final score
        if total_score < 30:
            classification = "LOW TRUST"
        elif total_score <= 60:
            classification = "MEDIUM TRUST"
        else:
            classification = "HIGH TRUST"

        return TrustScoreResult(
            final_score=round(total_score, 2),
            classification=classification,
            breakdown=score_breakdown
        )
