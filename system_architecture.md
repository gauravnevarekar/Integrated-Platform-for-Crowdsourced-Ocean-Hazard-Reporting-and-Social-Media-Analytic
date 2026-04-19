# Integrated Platform for Crowdsourced Ocean Hazard Reporting and Social Media Analytics
## System Architecture Design Document

### 1. Overview
The platform aims to provide real-time reporting and analytics of ocean hazards by crowdsourcing data from mobile/web app users and aggregating automated insights from social media platforms. The system uses a microservices architecture deployed on AWS, leveraging Kafka for event streaming and a hybrid data layer featuring PostgreSQL/PostGIS, TimescaleDB, and Redis.

### 2. Microservices Architecture
The system is divided into bounded contexts to ensure scalability and maintainability:

1.  **API Gateway**: The entry point for all client requests. Handles routing, rate limiting, and SSL termination.
2.  **User & Auth Service**: Manages user registration, profiles, roles (citizen, admin, agency), and authentication via JWT and OAuth2.
3.  **Hazard Report Service**: Handles explicit hazard reports submitted by users. Manages media uploads (images/videos) and metadata.
4.  **Social Ingestion Service**: Connects to social media APIs (Twitter, Instagram, FB). Fetches data based on geolocation and keywords, then publishes raw events to Kafka.
5.  **NLP & Processing Service**: Consumes raw social events from Kafka. Runs text analysis (hazard classification, severity detection) and extracts entities (location, time) to convert unstructured posts into structured hazard data.
6.  **Spatial & Analytics Service**: Aggregates structured data (both crowdsourced and social). Exposes REST APIs for historical analysis and interacts with PostGIS and TimescaleDB.
7.  **Real-time Notification Service**: Manages WebSocket connections to broadcast live hazard alerts to active clients in specific geofences.

### 3. Database Design
The data layer is polyglot, choosing the right tool for specific requirements:

*   **PostgreSQL with PostGIS**
    *   *Usage*: Primary transactional database.
    *   *Role*: Stores user profiles, application metadata, and structured hazard reports. PostGIS is heavily utilized to run complex spatial queries (e.g., "Find all oil spills within a 50km radius of [Lat, Long]").
*   **TimescaleDB**
    *   *Usage*: Time-series analytics.
    *   *Role*: Stores high-frequency aggregated data over time. Used to generate trends (e.g., "Jellyfish blooms over the last 30 days in specific regions").
*   **Redis**
    *   *Usage*: In-memory data store.
    *   *Role*: Caches frequent queries (e.g., current active hazards in a popular area), stores session data, manages rate-limiting counters, and acts as a Pub/Sub broker for the Notification Service.

### 4. API Structure
*   **REST API**: Used for standard CRUD operations, historical data retrieval, and user management.
    *   `POST /api/v1/reports` - Submit a hazard report.
    *   `GET /api/v1/hazards?lat=X&lon=Y&radius=Z` - Spatial fetch of hazards.
*   **WebSocket API**: Used for bi-directional, low-latency communication.
    *   `wss://api.domain.com/ws/live-hazards`
    *   Clients subscribe to specific geographic zones. When the NLP service or Report service validates a new hazard, the Notification Service pushes a JSON payload via WebSocket to all subscribed clients in that zone instantly.

### 5. Social Media Ingestion Pipeline (Apache Kafka)
1.  **Extract**: The Social Ingestion Service continuously polls or receives webhooks from Social Media APIs.
2.  **Publish**: Raw JSON payloads are published to the `raw-social-stream` Kafka topic.
3.  **Buffer & Decouple**: Kafka retains these streams, handling traffic spikes (e.g., during a major hurricane) without overwhelming downstream services.
4.  **Consume**: The NLP service consumes `raw-social-stream` in consumer groups to horizontally scale processing dynamically.

### 6. NLP Processing Pipeline
1.  **Data Cleaning**: Strip URLs, emojis, and irrelevant tags from the raw social media text.
2.  **Geoparsing / Entity Extraction**: Use models (e.g., spaCy) to extract implicitly mentioned locations if explicit geo-tags are missing. Map text locations to coordinates.
3.  **Hazard Classification**: A supervised NLP model (e.g., fine-tuned BERT/RoBERTa) classifies the text into categories: `OIL_SPILL`, `ROUGH_SEAS`, `DEBRIS`, `JELLYFISH`, `CAPSIZED_BOAT`, or `NONE`.
4.  **Severity Scoring**: Assign a confidence and severity score based on the text context.
5.  **Output**: Validated hazards are forwarded to the `processed-hazards` Kafka topic, which is consumed by the Database writer and Notification service.

### 7. Cloud Infrastructure (AWS)
*   **Compute**: Amazon EKS (Elastic Kubernetes Service) for container orchestration, allowing services to auto-scale based on load.
*   **Message Broker**: Amazon MSK (Managed Streaming for Apache Kafka).
*   **Databases**: Amazon RDS for PostgreSQL (with PostGIS enabled), Amazon ElastiCache for Redis.
*   **Storage**: Amazon S3 for storing user-uploaded media (photos/videos of hazards). Metadata in DB points to S3 URLs.
*   **CDN / Edge**: AWS CloudFront for caching images and static web app assets.
*   **Machine Learning**: Amazon SageMaker for hosting and serving the NLP and CV inference endpoints.

### 8. Authentication & Security
*   **Auth Lifecycle**: Implemented using AWS Cognito or an open-source alternative (Keycloak) for JWT-based authentication.
*   **RBAC (Role-Based Access Control)**: Regular users can report; Admins/Agencies can verify reports or mute malicious users.
*   **API Security**: AWS WAF (Web Application Firewall) attached to the API Gateway to prevent DDoS attacks and SQL injection. Rate limiting enforced via Redis to prevent API abuse.
*   **Data Security**: TLS 1.3 for data in transit. AES-256 encryption for data at rest (RDS and S3 KMS keys).

### 9. System Diagram (Text Description)
```
[ Mobile App / Web App ] 
         | (REST/WebSocket)
         v
[ AWS API Gateway + WAF ]
         |
         +--> [ User Service ] <--> (RDS Auth DB)
         |
         +--> [ Hazard Report Service ] <--> (S3 Media Store) ---> [ Kafka: processed-hazards ]
         |
         +--> [ Spatial & Analytics ] <--> (RDS PostGIS / TimescaleDB)
         |
         +--> [ Notification Service ] <--> (Redis Pub/Sub) <--- [ Kafka: processed-hazards ]

[ Twitter / FB / Insta APIs ]
         |
         v
[ Social Ingestion Service ]
         |
         v
[ Kafka: raw-social-stream ]
         |
         v
[ NLP & Processing Service ] <--> (Amazon SageMaker NLP Model)
         |
         v
[ Kafka: processed-hazards ] --> (Database Sink / Notification Service)
```
