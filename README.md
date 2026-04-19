# Ocean Hazard Reporting Platform

A robust microservices architecture for tracking, classifying, and alerting users regarding ocean hazards.

## System Architecture

Services communicating within a Docker bridge network (`ocean_network`):
1. **Frontend**: React (Vite) user dashboard (Port `5173`)
2. **API Gateway**: Node.js REST API handling CRUD and auth (Port `3000`)
3. **NLP Service**: FastAPI Python app for analyzing text reports (Port `8000`)
4. **Pipeline Service**: Python Kafka Background Consumer loading social/API data into TimescaleDB
5. **Alert Service**: Python APScheduler Engine identifying critical clusters and triggering notifications
6. **Data Plane**: 
    - PostgreSQL + PostGIS (`5432`)
    - TimescaleDB (`5433`)
    - Redis Cache (`6379`)
    - Apache Kafka & Zookeeper (`9092`)

## Getting Started

1. Set up Environment Variables
   ```bash
   cp .env.example .env
   # Edit .env and supply your necessary keys
   ```

2. Generate Service Scaffolding
   Ensure any missing entrypoint scripts (`index.js` or `main.py` depending on the service) are present in the service directories. (E.g. Place your `alert_engine.py` logic inside `alert-service/main.py`).

3. Start Infrastructure
   ```bash
   docker-compose up -d --build
   ```

4. Access Output
   - React Frontend: `http://localhost:5173`
   - API Gateway: `http://localhost:3000`
   - FastAPI Docs: `http://localhost:8000/docs`

## Tearing Down
```bash
docker-compose down -v
```
