import logging
import feedparser
import requests
import time
from html.parser import HTMLParser

logger = logging.getLogger(__name__)

API_URL = "http://localhost:3000/api/reports"

RSS_FEEDS = [
    "https://www.tsunami.gov/events/xml/world_events.xml", # Tsunami warnings
    "https://www.gdacs.org/xml/rss.xml", # Global Disaster Alert and Coordination System
]

def post_hazard_to_api(hazard_data):
    try:
        headers = {"Content-Type": "application/json"}
        if hazard_data.get('latitude') == 0.0:
            hazard_data['latitude'] = 25.0
            hazard_data['longitude'] = -80.0
            
        response = requests.post(API_URL, json=hazard_data, headers=headers, timeout=5)
        if response.status_code == 201:
            logger.info(f"Successfully posted RSS hazard: {hazard_data['title']}")
        else:
            logger.warning(f"Failed to post RSS hazard: {response.text}")
    except Exception as e:
        logger.error(f"Failed to connect to API: {e}")

class MLStripper(HTMLParser):
    def __init__(self):
        super().__init__()
        self.reset()
        self.strict = False
        self.convert_charrefs= True
        self.fed = []
    def handle_data(self, d):
        self.fed.append(d)
    def get_data(self):
        return ''.join(self.fed)

def strip_tags(html):
    s = MLStripper()
    s.feed(html)
    return s.get_data()

def process_rss_feeds():
    logger.info(f"Processing {len(RSS_FEEDS)} RSS feeds for marine hazards...")
    try:
        hazards_found = 0
        for feed_url in RSS_FEEDS:
            logger.info(f"Parsing feed: {feed_url}")
            feed = feedparser.parse(feed_url)
            
            # GDACS and Tsunami.gov usually have geo:lat and geo:long namespaces
            for entry in feed.entries[:5]: # Process top 5 recent alerts
                title = entry.get('title', 'Unknown Alert')
                summary_raw = entry.get('summary', '')
                summary = strip_tags(summary_raw)[:500]
                
                # Check marine relevance for GDACS (Earthquakes, Tsunamis, Cyclones)
                is_marine = False
                if 'tsunami.gov' in feed_url:
                    is_marine = True
                    category_id = 4 # natural disaster
                elif 'cyclone' in title.lower() or 'tsunami' in title.lower() or 'marine' in summary.lower():
                    is_marine = True
                    category_id = 4 # natural disaster
                
                if not is_marine:
                    continue
                    
                lat, lon = 0.0, 0.0
                if 'geo_lat' in entry and 'geo_long' in entry:
                    lat = float(entry.geo_lat)
                    lon = float(entry.geo_long)
                elif hasattr(entry, 'where') and hasattr(entry.where, 'coordinates'):
                    # Sometimes provided as point
                    coords = entry.where.coordinates
                    if len(coords) == 2:
                        lon, lat = coords[0], coords[1]
                        
                severity = "critical" if 'red' in summary.lower() or 'tsunami warning' in title.lower() else "high"
                
                hazard = {
                    "category_id": category_id,
                    "title": f"RSS Alert: {title}",
                    "description": summary,
                    "latitude": lat,
                    "longitude": lon,
                    "severity": severity,
                    "photos": []
                }
                
                post_hazard_to_api(hazard)
                hazards_found += 1
                
            time.sleep(1)
            
        logger.info(f"Completed parsing RSS feeds. Found {hazards_found} hazards.")
    except Exception as e:
        logger.error(f"Error processing RSS feeds: {e}")
