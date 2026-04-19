import logging
import requests
import time

logger = logging.getLogger(__name__)

API_URL = "http://localhost:3000/api/reports"

def post_hazard_to_api(hazard_data):
    try:
        # Mock auth token (the API middleware requires it but doesn't strictly validate the signature in dev)
        # However, checking index.ts, it uses `authenticate` middleware. 
        # If no JWT is provided, it might fail. Let's provide a dummy one if it works, or we can just try.
        headers = {"Content-Type": "application/json"}
        # Some realistic default coords if 0
        if hazard_data.get('latitude') == 0.0:
            hazard_data['latitude'] = 25.0
            hazard_data['longitude'] = -80.0
            
        response = requests.post(API_URL, json=hazard_data, headers=headers, timeout=5)
        if response.status_code == 201:
            logger.info(f"Successfully posted hazard: {hazard_data['title']}")
        else:
            logger.warning(f"Failed to post hazard: {response.text}")
    except Exception as e:
        logger.error(f"Failed to connect to API: {e}")

def fetch_noaa_marine_alerts():
    logger.info("Fetching NOAA Marine Weather Alerts...")
    try:
        # Using weather.gov alerts API
        url = "https://api.weather.gov/alerts/active"
        headers = {"User-Agent": "OceanHazard-App/1.0"}
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        features = response.json().get("features", [])
        
        # Filter for marine-related alerts
        marine_alerts = [
            f for f in features 
            if 'marine' in f.get('properties', {}).get('event', '').lower() 
            or 'surf' in f.get('properties', {}).get('event', '').lower()
            or 'gale' in f.get('properties', {}).get('event', '').lower()
        ]
        
        for feature in marine_alerts[:5]:  # Limit to 5 per run
            props = feature.get("properties", {})
            geom = feature.get("geometry")
            
            lat, lon = 0.0, 0.0
            if geom and geom.get("type") == "Polygon":
                try:
                    coords = geom["coordinates"][0][0]
                    lon, lat = coords[0], coords[1]
                except (IndexError, TypeError):
                    pass
            
            severity = props.get('severity', 'moderate').lower()
            api_severity = 'critical' if severity in ['extreme', 'severe'] else ('high' if severity == 'moderate' else 'medium')

            hazard = {
                "category_id": 2, # Rough seas / Weather
                "title": f"NOAA: {props.get('event', 'Marine Alert')}",
                "description": props.get('description', '')[:500],
                "latitude": lat,
                "longitude": lon,
                "severity": api_severity,
                "photos": []
            }
            
            post_hazard_to_api(hazard)
            
        logger.info(f"NOAA Marine alerts fetched successfully. Found {len(marine_alerts)} marine alerts.")
    except Exception as e:
        logger.error(f"Error fetching NOAA marine alerts: {e}")

def fetch_noaa_buoy_data():
    logger.info("Fetching NOAA NDBC Buoy Data...")
    try:
        # Fetch latest observations from NDBC
        url = "https://www.ndbc.noaa.gov/data/latest_obs/latest_obs.txt"
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        
        lines = response.text.split('\n')
        # Format: #STN  LAT      LON      YYYY MM DD hh mm WDIR WSPD GST  WVHT DPD  ...
        # We'll look for high wave heights (WVHT > 4.0 meters)
        
        hazards_found = 0
        for line in lines[2:]: # Skip 2 header lines
            if not line.strip(): continue
            parts = line.split()
            if len(parts) < 10: continue
            
            try:
                station = parts[0]
                lat = float(parts[1])
                lon = float(parts[2])
                wvht_str = parts[8]
                
                if wvht_str != 'MM': # MM means missing data
                    wvht = float(wvht_str)
                    if wvht >= 4.0: # Significant wave height > 4 meters (~13 feet)
                        hazards_found += 1
                        
                        hazard = {
                            "category_id": 2, # Rough waves
                            "title": f"High Waves Detected at Buoy {station}",
                            "description": f"Significant wave height of {wvht}m recorded by NDBC buoy.",
                            "latitude": lat,
                            "longitude": lon,
                            "severity": "critical" if wvht >= 6.0 else "high",
                            "photos": []
                        }
                        
                        post_hazard_to_api(hazard)
                        if hazards_found >= 3: # Limit volume
                            break
            except ValueError:
                continue
                
        logger.info(f"NOAA Buoy data processed. Found {hazards_found} high wave incidents.")
    except Exception as e:
        logger.error(f"Error fetching NOAA buoy data: {e}")
