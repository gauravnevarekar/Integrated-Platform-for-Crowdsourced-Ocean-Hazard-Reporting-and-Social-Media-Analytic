import logging
import praw
import os
import time
import requests

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
            logger.info(f"Successfully posted Reddit hazard: {hazard_data['title']}")
        else:
            logger.warning(f"Failed to post Reddit hazard: {response.text}")
    except Exception as e:
        logger.error(f"Failed to connect to API: {e}")

def stream_reddit():
    logger.info("Initializing Reddit stream...")
    
    client_id = os.getenv("REDDIT_CLIENT_ID")
    client_secret = os.getenv("REDDIT_CLIENT_SECRET")
    
    if not client_id or not client_secret:
        logger.warning("\n[SKIP] Reddit API keys missing (REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET).\n[SKIP] Please add them to your .env file to enable the Reddit pipeline.\n")
        return
        
    try:
        reddit = praw.Reddit(
            client_id=client_id,
            client_secret=client_secret,
            user_agent=os.getenv("REDDIT_USER_AGENT", "OceanHazardBot 1.0")
        )
        
        # We listen to maritime-related subreddits
        subreddits = reddit.subreddit("OceanConservation+Sailing+HeavySeas+thalassophobia")
        logger.info("Listening to subreddits: OceanConservation, Sailing, HeavySeas...")
        
        # Stream new submissions indefinitely (master_pipeline runs this in a daemon thread)
        for submission in subreddits.stream.submissions(skip_existing=True):
            keywords = ['hazard', 'spill', 'storm', 'sinking', 'rogue wave', 'debris', 'capsized', 'warning', 'danger']
            if any(k in submission.title.lower() or k in submission.selftext.lower() for k in keywords):
                
                hazard = {
                    "category_id": 5, # social media
                    "title": f"Reddit: {submission.title[:100]}",
                    "description": submission.selftext[:500] + f"\nURL: {submission.url}",
                    "latitude": 0.0,
                    "longitude": 0.0,
                    "severity": "medium",
                    "photos": [submission.url] if str(submission.url).endswith(('jpg', 'jpeg', 'png')) else []
                }
                post_hazard_to_api(hazard)
                time.sleep(1) # Give API a tiny break
                
    except Exception as e:
        logger.error(f"Error in Reddit pipeline: {e}")
