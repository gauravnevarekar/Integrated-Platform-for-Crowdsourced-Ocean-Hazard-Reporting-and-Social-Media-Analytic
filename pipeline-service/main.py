import threading
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

def run_reddit():
    from reddit_pipeline import stream_reddit
    logger.info("Starting Reddit pipeline...")
    stream_reddit()

def run_scraper():
    import schedule, time
    from scraper_pipeline import scrape_cruisers_forum, scrape_windy_community
    schedule.every(15).minutes.do(scrape_cruisers_forum)
    schedule.every(15).minutes.do(scrape_windy_community)
    scrape_cruisers_forum()
    scrape_windy_community()
    while True:
        schedule.run_pending()
        time.sleep(60)

def run_noaa():
    import schedule, time
    from noaa_pipeline import fetch_noaa_marine_alerts, fetch_noaa_buoy_data
    schedule.every(10).minutes.do(fetch_noaa_marine_alerts)
    schedule.every(30).minutes.do(fetch_noaa_buoy_data)
    fetch_noaa_marine_alerts()
    fetch_noaa_buoy_data()
    while True:
        schedule.run_pending()
        time.sleep(60)

def run_rss():
    import schedule, time
    from rss_pipeline import process_rss_feeds
    schedule.every(20).minutes.do(process_rss_feeds)
    process_rss_feeds()
    while True:
        schedule.run_pending()
        time.sleep(60)

if __name__ == "__main__":
    logger.info("Starting all free pipeline sources...")
    
    threads = [
        threading.Thread(target=run_reddit, daemon=True),
        threading.Thread(target=run_scraper, daemon=True),
        threading.Thread(target=run_noaa, daemon=True),
        threading.Thread(target=run_rss, daemon=True),
    ]
    
    for thread in threads:
        thread.start()
    
    logger.info("All pipelines running. Press Ctrl+C to stop.")
    
    for thread in threads:
        thread.join()
