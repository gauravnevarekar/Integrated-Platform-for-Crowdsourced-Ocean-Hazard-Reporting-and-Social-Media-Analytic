from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import spacy
from transformers import pipeline
from nltk.sentiment.vader import SentimentIntensityAnalyzer
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut
import nltk
import logging

# Ensure NLTK lexicons are downloaded
try:
    nltk.data.find('vader_lexicon')
except LookupError:
    nltk.download('vader_lexicon')

# Initialize logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(title="Ocean Hazard NLP Service", version="1.0.0")

# --- Load Models ---
# 1. Hugging Face Zero-Shot Classifier (acting as our fine-tuned model for this demo)
classifier = pipeline("zero-shot-classification", model="facebook/bart-large-mnli")

# 2. SpaCy Transformer Model for NER
# Note: You must run `python -m spacy download en_core_web_trf` before running this
try:
    nlp_ner = spacy.load("en_core_web_trf")
except OSError:
    logger.warning("en_core_web_trf not found. Loading en_core_web_sm as fallback.")
    try:
        nlp_ner = spacy.load("en_core_web_sm")
    except OSError:
        import subprocess
        subprocess.run(["python", "-m", "spacy", "download", "en_core_web_sm"])
        nlp_ner = spacy.load("en_core_web_sm")

# 3. NLTK VADER Setup
sia = SentimentIntensityAnalyzer()

# 4. GeoPy Nominatim for Geolocation
geolocator = Nominatim(user_agent="ocean_hazard_nlp_service")

# --- Constants ---
HAZARD_CATEGORIES = [
    "OIL_SPILL", "ROUGH_SEAS", "MARINE_DEBRIS", "JELLYFISH_BLOOM", 
    "CHEMICAL_SPILL", "WILDLIFE_DISTRESS", "ROGUE_WAVE", 
    "VESSEL_IN_DISTRESS", "WATER_DISCOLORATION", "UNKNOWN"
]

SEVERITY_CATEGORIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]

# Request Model
class TextRequest(BaseModel):
    text: str
    source_platform: str = "unknown"

# Helper finding Location coordinates
def extract_coordinates(location_name: str):
    try:
        location = geolocator.geocode(location_name, timeout=3)
        if location:
            return {"latitude": location.latitude, "longitude": location.longitude}
    except GeocoderTimedOut:
        logger.error(f"Geocoding timeout for {location_name}")
    except Exception as e:
        logger.error(f"Geocoding error for {location_name}: {e}")
    return None

@app.post("/analyze")
async def analyze_text(request: TextRequest):
    text = request.text
    if not text.strip():
        raise HTTPException(status_code=400, detail="Text cannot be empty")
        
    try:
        # 1. Hazard Classification
        hazard_result = classifier(text, HAZARD_CATEGORIES)
        primary_hazard = hazard_result['labels'][0]
        hazard_confidence = hazard_result['scores'][0]

        # 2. Severity Detection
        # Since BART zero shot works well, we can zero-shot the severity too based on context
        severity_result = classifier(text, SEVERITY_CATEGORIES)
        severity_level = severity_result['labels'][0]
        severity_confidence = severity_result['scores'][0]

        # 3. Named Entity Recognition (NER)
        doc = nlp_ner(text)
        locations = []
        vessels = []
        hazard_objects = [] # Using heuristic or generic entities

        for ent in doc.ents:
            if ent.label_ in ["GPE", "LOC", "FAC"]:  # Geopolitical, Location, Facility
                locations.append(ent.text)
            elif ent.label_ in ["ORG", "PRODUCT"] and ("ship" in text.lower() or "boat" in text.lower()):
                vessels.append(ent.text)
            # Other entities can be dumped or classified manually based on rules

        # Remove duplicates
        locations = list(set(locations))
        
        # 4. Sentiment Analysis (adapted for emergency urgency)
        sentiment_scores = sia.polarity_scores(text)
        # We invert compound score to get urgency: negative sentiment -> high urgency (1.0)
        # VADER compound: -1 (extreme negative) to +1 (extreme positive)
        # Urgency: 0.0 (no emergency/happy) to 1.0 (extreme emergency)
        compound = sentiment_scores['compound']
        urgency_score = max(0.0, min(1.0, ((-compound) + 1) / 2))

        # 5. Geolocation Extraction
        geolocations = []
        for loc in locations:
            coords = extract_coordinates(loc)
            if coords:
                geolocations.append({
                    "name": loc,
                    "latitude": coords["latitude"],
                    "longitude": coords["longitude"]
                })

        # Assemble the final response payload
        return {
            "hazard_classification": {
                "category": primary_hazard if hazard_confidence > 0.3 else "UNKNOWN",
                "confidence": hazard_confidence,
                "all_scores": dict(zip(hazard_result['labels'][:3], hazard_result['scores'][:3]))
            },
            "severity_detection": {
                "level": severity_level,
                "confidence": severity_confidence
            },
            "named_entities": {
                "locations": locations,
                "vessels": vessels,
                "hazard_objects": hazard_objects
            },
            "urgency_analysis": {
                "vader_compound": compound,
                "urgency_score": round(urgency_score, 4)
            },
            "geolocations": geolocations,
            "raw_text": text
        }

    except Exception as e:
        logger.error(f"Error during analysis: {e}")
        raise HTTPException(status_code=500, detail="Internal server error during text processing.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
