import logging
import requests
from bs4 import BeautifulSoup
import time
import re

logger = logging.getLogger(__name__)

API_URL = "http://localhost:3000/api/reports"

def post_hazard_to_api(hazard_data):
    try:
        headers = {"Content-Type": "application/json"}
        if hazard_data.get('latitude') == 0.0:
            hazard_data['latitude'] = 25.0
            hazard_data['longitude'] = -80.0
            
        response = requests.post(API_URL, json=hazard_data, headers=headers, timeout=5)
        if response.status_code == 201:
            logger.info(f"Successfully posted Scraping hazard: {hazard_data['title']}")
        else:
            logger.warning(f"Failed to post Scraping hazard: {response.text}")
    except Exception as e:
        logger.error(f"Failed to connect to API: {e}")

def scrape_cruisers_forum():
    logger.info("Scraping Cruisers Forum for hazard reports...")
    try:
        url = "https://www.cruisersforum.com/forums/f134/" # Navigation Warnings
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        soup = BeautifulSoup(response.content, "html.parser")
        
        # Find thread titles
        # Cruisers Forum uses vBulletin 3.x
        threads = soup.find_all('a', id=re.compile('^thread_title_'))
        
        hazards_found = 0
        keywords = ['warning', 'hazard', 'pirate', 'storm', 'debris', 'sunken', 'dangerous']
        
        for thread in threads[:10]:
            title = thread.text.strip()
            if any(keyword in title.lower() for keyword in keywords):
                hazard = {
                    "category_id": 3, # general hazard / debris
                    "title": f"Forum Report: {title}",
                    "description": f"A navigation warning or hazard was posted on Cruisers Forum: {title}",
                    "latitude": 0.0, # Without NLP, we don't know the exact coords from the title easily
                    "longitude": 0.0,
                    "severity": "medium",
                    "photos": []
                }
                post_hazard_to_api(hazard)
                hazards_found += 1
                
        logger.info(f"Successfully checked Cruisers Forum. Found {hazards_found} new hazard threads.")
        
    except requests.exceptions.RequestException as e:
        logger.error(f"Network error scraping Cruisers Forum: {e}")
    except Exception as e:
        logger.error(f"Error parsing Cruisers Forum: {e}")

def scrape_windy_community():
    logger.info("Scraping Windy Community for extreme weather mentions...")
    try:
        # Windy community uses NodeBB, we can hit the JSON API directly for the Hurricane tracker category
        url = "https://community.windy.com/api/category/16/hurricane-tracker"
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
        }
        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        topics = data.get('topics', [])
        
        hazards_found = 0
        for topic in topics[:5]:
            title = topic.get('title', '')
            
            # If it's a recent extreme storm or hurricane
            hazard = {
                "category_id": 2, # rough seas / weather
                "title": f"Windy Tracker: {title}",
                "description": f"Hurricane or severe weather tracked on Windy Community: {title}",
                "latitude": 0.0,
                "longitude": 0.0,
                "severity": "high",
                "photos": []
            }
            post_hazard_to_api(hazard)
            hazards_found += 1
            
        logger.info(f"Successfully checked Windy Community. Found {hazards_found} trackers.")
        
    except Exception as e:
        logger.error(f"Error scraping Windy Community: {e}")
