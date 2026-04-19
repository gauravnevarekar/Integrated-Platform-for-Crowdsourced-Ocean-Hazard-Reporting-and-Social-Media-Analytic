import logging
from datetime import datetime, timedelta
import math
from apscheduler.schedulers.background import BackgroundScheduler
import requests

# Mock database for storing processed alerts and deduplication
# In a real app this would be a proper database connection (SQL/NoSQL)
ALERT_DB = []

# Mock functions for notifications
def send_email_via_sendgrid(alert_data):
    logging.info(f"Sending Email via SendGrid: {alert_data['alert_type']}")
    # import sendgrid
    # ... setup sendgrid ...

def send_sms_via_twilio(alert_data):
    logging.info(f"Sending SMS via Twilio: {alert_data['alert_type']}")
    # from twilio.rest import Client
    # ... setup twilio ...

def send_push_via_fcm(alert_data):
    logging.info(f"Sending Push Notification via FCM: {alert_data['alert_type']}")
    # import firebase_admin
    # ... setup firebase ...

def post_to_slack_webhook(alert_data):
    logging.info(f"Posting to Slack: {alert_data['alert_type']}")
    # slack_webhook_url = "https://hooks.slack.com/services/..."
    # requests.post(slack_webhook_url, json={"text": f"ALERT: {alert_data['alert_type']}"})

def store_alert_in_db(alert_data):
    logging.info(f"Storing alert in DB: {alert_data['alert_type']}")
    ALERT_DB.append({**alert_data, "stored_at": datetime.now()})

def trigger_alert(alert_type, geographic_area, metadata):
    """
    Handles triggering all notification channels and deduping logic.
    """
    # Deduplication: Check if this alert type fired in this area in the last hour
    cutoff_time = datetime.now() - timedelta(hours=1)
    
    for alert in ALERT_DB:
        if (alert['alert_type'] == alert_type and 
            alert['geographic_area'] == geographic_area and 
            alert['timestamp'] >= cutoff_time):
            logging.info(f"Deduplicating {alert_type} for area {geographic_area}. Already fired within the hour.")
            return

    logging.warning(f"TRIGGERING ALERT: {alert_type} for area {geographic_area}")
    
    alert_data = {
        "alert_type": alert_type,
        "geographic_area": geographic_area,
        "timestamp": datetime.now(),
        "metadata": metadata
    }

    store_alert_in_db(alert_data)
    send_email_via_sendgrid(alert_data)
    send_sms_via_twilio(alert_data)
    send_push_via_fcm(alert_data)
    post_to_slack_webhook(alert_data)


# Helper distance function (Haversine formula)
def calculate_distance(lat1, lon1, lat2, lon2):
    R = 6371.0 # Radius of earth in km
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlon = lon2 - lon1
    dlat = lat2 - lat1
    a = math.sin(dlat / 2)**2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2)**2
    c = 2 * math.asin(math.sqrt(a))
    return R * c

# Mock Data Retrieval
def get_reports_from_db(since: datetime):
    # In a real environment, query the database.
    return []

def evaluate_alert_rules():
    logging.info("Evaluating alert rules...")
    now = datetime.now()
    
    # We generally need reports from the last 1 hour for the rules
    recent_reports = get_reports_from_db(since=now - timedelta(hours=1))
    
    print(f"Checking rules against {len(recent_reports)} recent reports.")

    # Group reports for evaluation
    for report in recent_reports:
        # Geographic area representation (e.g. rounded lat/lon or a grid ID)
        area_key = f"({round(report['lat'], 2)}, {round(report['lon'], 2)})"

        # Rule 2: Critical Single Report
        if report.get('trust_score', 0) > 85 and report.get('severity') == 'CRITICAL':
            trigger_alert(
                alert_type="CRITICAL_SINGLE_REPORT",
                geographic_area=area_key,
                metadata={"report_id": report['id'], "score": report['trust_score']}
            )

    # Rule 1: Cluster Alert (3+ HIGH severity within 20km within 1 hour)
    high_severity_reports = [r for r in recent_reports if r.get('severity') == 'HIGH']
    
    # Very basic O(N^2) clustering for the example. Real implementation would use PostGIS or spatial index.
    processed_clusters = set()
    for i, base_rep in enumerate(high_severity_reports):
        if base_rep['id'] in processed_clusters:
            continue
            
        cluster = [base_rep]
        for j, other_rep in enumerate(high_severity_reports[i+1:]):
            if base_rep['hazard_type'] == other_rep['hazard_type']:
                dist = calculate_distance(base_rep['lat'], base_rep['lon'], other_rep['lat'], other_rep['lon'])
                if dist <= 20.0:
                    cluster.append(other_rep)
        
        if len(cluster) >= 3:
            area_key = f"({round(base_rep['lat'], 2)}, {round(base_rep['lon'], 2)})"
            trigger_alert(
                alert_type="CLUSTER_ALERT",
                geographic_area=area_key,
                metadata={"cluster_size": len(cluster), "hazard_type": base_rep['hazard_type']}
            )
            for r in cluster:
                processed_clusters.add(r['id'])

    # Rule 3: Rapid Escalation
    # 300% increase in report volume in 30 mins compared to previous 30 mins
    # We will partition reports into geographic grids of ~20km for volume calculation
    grid_volumes = {}
    
    for r in recent_reports:
        # Simple rounding to ~10-20km grids (dependant on latitude)
        grid_key = f"{round(r['lat'], 1)}_{round(r['lon'], 1)}"
        if grid_key not in grid_volumes:
            grid_volumes[grid_key] = {"last_30m": 0, "prev_30m": 0}
            
        if r['timestamp'] >= now - timedelta(minutes=30):
            grid_volumes[grid_key]["last_30m"] += 1
        elif r['timestamp'] >= now - timedelta(minutes=60):
            grid_volumes[grid_key]["prev_30m"] += 1

    for grid_key, volumes in grid_volumes.items():
        prev_vol = volumes["prev_30m"]
        last_vol = volumes["last_30m"]
        
        # Guard against zero-division. Let's say we need at least a baseline to avoid noise.
        if prev_vol >= 1: 
            increase_percent = ((last_vol - prev_vol) / prev_vol) * 100
            if increase_percent >= 300:
                trigger_alert(
                    alert_type="ESCALATION_ALERT",
                    geographic_area=f"Grid {grid_key}",
                    metadata={
                        "increase_percent": increase_percent, 
                        "prev_volume": prev_vol, 
                        "current_volume": last_vol
                    }
                )

if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
    
    # Setup APScheduler
    scheduler = BackgroundScheduler()
    scheduler.add_job(evaluate_alert_rules, 'interval', seconds=60)
    scheduler.start()
    
    logging.info("Alert Engine Scheduled. Press Ctrl+C to exit.")
    
    try:
        # Keep the main thread alive
        import time
        while True:
            time.sleep(2)
    except (KeyboardInterrupt, SystemExit):
        scheduler.shutdown()
        logging.info("Scheduler shut down successfully.")
