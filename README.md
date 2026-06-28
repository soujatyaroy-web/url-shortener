# AI-Assisted URL Shortener Service

A production-grade URL shortener service engineered for high throughput, structural integrity, and minimal redirection latency. This platform utilizes a modern three-tier decoupled architecture to separate static front-end asset delivery from highly optimized, type-safe backend execution paths.

---
## Product Use Case Definition

When a user has a long, unwieldy URL that needs to be shared across character-constrained or visually public channels, they want to submit the URL to a reliable compression service that converts it into a shorter version, so that they can distribute a clean, shareable link. When the user clicks on the shortened url, they want to be forwarded to their original destination instantly.  

## Success Metric
**Link Creation Volume**: Total number of URLs generated per day  
**Daily Active User**: Total number of unique users who perform Shorten URL action within a single 24-hour window.  
**Click-Through Rate**: The percentage of users who click on Shorten URL action out of total page views.  
**Link Generation Latency**: The time it takes to generate and display back a short link on submit of of long url.  
**Redirection Latency**: The time it takes to map a short link to a long URL  

## High Level Functional Requirements  
**URL Length & Input Capacity** _(Must-have)_: The system can easily accept and process exceptionally long web addresses(up to 2,048 characters).  
**URL Validation** _(Must-have)_: The system checks incoming links to make sure they are rightly formatted and valid.  
**URL Shortening** _(Must-have)_: The system creates short, reliable web links that never overlap or overwrite each other.  
**URL Redirection** _(Must-have)_: The system can redirect the short url to the actual destination.  
**Usage Analytics** _(Could-have_): The system should be able top track the number of page views & click-through rate.

## Assumption  
**Device Distribution**: We assume a highly fragmented device landscape where approximately 80% of our active users shorten or click links via desktop or laptop environments, while 20% operate from mobile view.  
**Browser Footprint**: Our core target audience operates on modern, updated devices. We assume compatibility only with "evergreen" browsers (Chrome, Safari, Edge, Firefox) released within the last 3 years.  



## Out of Scope   
**User Authentication & Session Management**: No multi-tenant user accounts, login flows, or secure cookie sessions will be introduced in this phase.  
**Link Expiration & Automatic Cleanup Automation**: Granular cron-job deletion of expired links or database table vacuums are omitted from this current core iteration.  
**Custom Branded Domains**: Users cannot put up their own domains. Everything goes through a mock base domain.  
**Deep User Dashboard**: No complex frontend visualization engine, charts, or geographic maps in this initial version.  





---
## System Architecture Overview

### Deployment & Infrastructure Strategy
The platform architecture is structured as a completely decoupled, modern three-tier infrastructure designed for high throughput, minimal operational contention, and near-zero latency redirection pathways:

* **Frontend Layer (Vercel):** Deployed as a pure static web application on Vercel’s global Edge Network. This guarantees near-zero millisecond static asset loading times worldwide and completely unburdens the active API container from static content routing.
* **Backend Layer (Render):** Deployed as an isolated, persistent Web Service on Render. Node.js with TypeScript processes workloads asynchronously via Fastify’s single-threaded event loop, maximizing concurrent connection capabilities on constrained infrastructure.
* **Data Layer (Supabase / PostgreSQL):** A managed, ACID-compliant cloud PostgreSQL instance hosted on Supabase. This infrastructure ensures relational integrity, transactional consistency, and predictable $O(\log N)$ lookups using explicit indexes on URL mapping entries.
* **Performance & Caching Layer (Upstream Redis):** To protect the database state layers under peak read amplification, the redirection mechanism leverages an out-of-band caching tier configured with a **24-hour Time-to-Live (TTL)**:

1.  **Cache Read First:** When a short code redirection request hits `GET /:shortCode`, the backend performs an immediate $O(1)$ read lookup from an active **iORedis** connection pool.
2.  **Database Fallback on Cache Miss:** If the short code is missing from Redis, the application falls back to a Supabase PostgreSQL query to fetch the original `long_url`.
3.  **Non-Blocking Background Write:** To eliminate thread blockages, the database result triggers an asynchronous, non-blocking cache set command (`SETEX`). By omitting the `await` keyword on the cache update, the thread bypasses the Redis network round-trip and immediately executes the HTTP 302 redirection back to the user without blocking the lifecycle.

   ```
+-----------------------------------+  

              |          FRONTEND LAYER           |  
              |     Hosted on Vercel Edge Net     |  
              |  (Static HTML/CSS/JS + Analytics)  |  
              +-----------------+-----------------+  
                                |  
                                | HTTPS API Requests  
                                v  
              +-----------------------------------+  

              |           BACKEND LAYER           |  
              |        Render Web Service         |  
              |  (Node.js + TypeScript + Fastify) |  
              +--------+-----------------+--------+  

                       |                 |  
     1. Read First /   |                 | 2. Fallback on  
     3. Async Cache    |                 |    Cache Miss  
        Write          v                 v  
              +--------+--------+  +-----+------------+  

              |   CACHE LAYER   |  |    DATA LAYER    |  
              |  Redis Cluster  |  |  Supabase Cloud  |  
              | (24-Hour TTL)   |  |  PostgreSQL DB   |  
              +-----------------+  +------------------+
```
``
### Technical Stack & KDD
* **Runtime & Language:** **Node.js (TypeScript)**. The combination of Node.js's I/O performance and TypeScript's compile-time safety provides the most robust foundation for rapid prototyping.
* **Web Framework:** **Fastify**. Highly reliable code made Fastify’s strict schema enforcement and superior baseline performance the optimal choice.  
* **Database Interface:** **Supabase JS Client**. The acceleration in delivery speed and built-in scalability mechanisms.

**KDD1: Short Code Generation Approach**

**Option A**: Cryptographic or Pseudo-Random String Hashing (e.g., MD5/SHA-256 truncated to 6–8 characters).  
_Pros:_ Decentralized and independent of a central database sequence; short codes are entirely unpredictable, preventing token enumeration.  
_Cons:_ High statistical probability of hash collisions at scale. Resolving collisions requires writing expensive "retry-on-collision" application loops and extra read operations against the database before insertion, significantly increasing development effort and testing complexity.  

**Option B**: Sequential Auto-Incrementing Integer IDs mapped to a deterministic Base62 encoding utility string ([0-9a-zA-Z]).  
_Pros:_ Extremely low development effort. Guarantees mathematical uniqueness because every auto-incrementing integer maps to a single Base62 string. Zero storage collision risk completely eliminates the need to write complex database validation or query retry logic.  
_Cons:_ Predictable token generation sequences allow sequential URL enumeration unless obfuscated. 

**Decision Summary: Option B**: To ensure high performance execution & low effort development.  

**KDD2: Redirection Path Approach**

**Option A**: Direct Relational Queries against the Supabase PostgreSQL database for every incoming request.   
_Pros:_ The easiest deployment model and the absolute lowest development effort.  
_Cons:_ High read traffic spikes can easily bottleneck the relational DB.    

**Option B**: Dual-Stage Caching.  
_Pros:_ Achieves ultra-fast read speeds and shields the primary database from read spikes.    
_Cons:_ Slightly higher deployment and configuration effort. 

**Decision Summary: Option B**: Inclusion of an asynchronous cache layer provides reliability and improved performance.


## AI-Assisted Engineering Framework

This prototype was developed utilizing a disciplined **Engineer-in-the-Loop** execution framework, treating generative AI tools strictly as high-leverage accelerators while maintaining complete human ownership over architectural boundaries, code correctness, and quality gates.

* **Strategic Requirement Normalization (Gemini):** Gemini was tasked with translating high-level business use cases into an exhaustive Product Requirement Document (PRD). This PRD was again fed to Gemini to decompose into precise functional User Stories and technical Enabler Stories.
* **Implementation Acceleration (GitHub Copilot):** GitHub Copilot was utilized within the IDE to generate deterministic boilerplate logic, including Fastify route schemas, Base62 translation utilities, url redirection service and front-end template.
* **Quality Assurance & Test Automation:** Copilot was instructed to generate comprehensive **Jest unit test suites** mapping with comprehensive coverage of methods and boundary inputs referencing the criteria of each user story.
* **Human-Led Quality Gates:** Human oversight was rigorously applied at every transition point. No AI-generated artifact was committed without a manual code review and empirical testing.   

**Note**: The AI_TRACEABILITY_LOG.md file notes the prompts and revision.

---

## Scenario 1: Core URL Shortener

### Requirements
Ability to convert an arbitrary URL into a shortened, shareable token with necessary input validations and redirection to the original url from the short url.  

### Task Decomposition
**User Stories:**
**US_001: View the URL Shortener page**  
As a user, I want to enter a long URL and view the "Shorten URL" button, so that I submit the long URL to get a short URL.  

_Acceptance Criteria:_  
**AC1**: Given the page is loaded, when the user reads the top header, then the title "URL Shortener" must be visible, followed by the sub-instruction: "Submit a long URL and get a clean, shareable short link".  
**AC2**: Given the user is identifying the input area, when they look above the text area, then the label "Enter your long URL" must be clearly positioned.   
**AC3**: Given the "URL Shortener" page is loaded, when the user views the "Enter your long URL" area, then it must be a multi-line text box capable of accepting up to 2,048 characters .  
**AC4**: Given the user is typing, when characters are entered, then the counter at the bottom-left corner must update in real-time to display the current character count relative to the 2,048 limit (e.g., "5 / 2048").   
**AC5**: Given the user is viewing the page, when they look at the bottom-right corner of the text area, then they must see the instructional text: "Must begin with http:// or https://".   
**AC6**: Given the user has entered content, when they look at the button below the text area, then it must be labeled "Shorten URL" and span the full width of the input area.  

**US_002: Validate Entered URL**  
As a user, I want to receive a warning if my URL does not start with the correct protocol or is invalid, so that I can rectify the url.  

_Acceptance Criteria:_  
**AC1**: Given I have entered a URL that does not begin with "http://" or "https://",
whenI click the "Shorten URL" button, then the system should display an error message stating "URL must start with http:// or https://.".  
**AC2**: Given I have entered a URL that starts with "http://" but is otherwise malformed or invalid,
when I click the "Shorten URL" button, then the system should display an error message below the Shorten URL button stating "Please enter a valid URL before submitting.".  

**US_003: Generate Short URL**  
As a user, I want to submit a long URL and receive a shortened link, so that I can share my content using a compact, clean URL.   

_Acceptance Criteria:_  
**AC1**: Given I have submitted a valid long URL, when the URL is saved to the database, then the system must retrieve the Primary Key (ID) of the new row and convert it to a Base62 string (using the charset 0-9, a-z, A-Z) to create the unique token.  
Example for QA: If the Primary Key is 12345, the Base62 encoding logic should be:  
$12345 \div 62 = 199$ remainder $7$ (Char: '7')  
$199 \div 62 = 3$ remainder $13$ (Char: 'd')  
$3 \div 62 = 0$ remainder $3$ (Char: '3')  
Resulting Token: Reverse of remainder chain $\rightarrow$ 3d7  
**AC2**: Given the application has been active (i.e., the "Shorten URL" button has been clicked by someone within the last 15 minutes), when I click the "Shorten URL" button, then the response containing the Short URL must be rendered in less than equal to 2 seconds.  
**AC3**: Given the application has been inactive for more than 15 minutes (i.e., no clicks on the "Shorten URL" button during this period), when I click the "Shorten URL" button, then the response may be delayed due to cold-start overhead, but must be rendered in less than equal to 60 seconds.  
**AC4**: Given a generated Short URL, when I copy and paste it into a browser, then the system must correctly decode the Base62 token back to the specific Primary Key and redirect me to the original long URL stored in the database.  

**US_004: Redirect Short URL to Original Destination**  
As a user, I want to copy the short URL and click on it to reach my original destination, so that I can easily access the long URL without having to handle the complex, original address.    

_Acceptance Criteria:_  
**AC1**: Given I have a valid short URL, when I copy it to my clipboard and paste/click it in a browser, then the application must resolve the Base62 token, look up the corresponding long_url, and redirect to the destination URL.  
**AC2**: Given I am using a short URL that has been deleted or was never generated, when I navigate to that URL, then the system must display an error page with the message: "The requested short URL does not exist."  

**Enabler Story**  
**ES_001: Base62 Implementation & Cold-Start Tuning**  
As an Engineering Team, we need to implement the Base62 conversion logic and configure infrastructure cold-start behaviors, so that we satisfy both the performance SLA for active users and the cold-start constraints for inactive periods.  
**E1**: The Base62 encoding service is implemented and unit-tested against various integer inputs (including edge cases like 0, 1, and large integers exceeding 1,000,000).   
**E2**: The system infrastructure is configured to identify the 15-minute inactivity window and manage "warm-up" time for the database connection and application server during cold starts.  
**ES_002: Database Schema Definition & Implementation**   
As an Engineering Team, we need to define the “urls” table schema in our relational database as specified in the technical design, so that we have a persistent, structured foundation for storing URL mappings, tracking metadata, and supporting the Base62 encoding retrieval logic.   
**E1**: The urls table must be created with the following columns and data types:  
id: int8 (Primary Key, Auto-increment/Serial)  
long_url: text (Required/Not Null)  
short_code: varchar (Unique Index, to store the Base62 encoded string)  
created_at: timestamptz (Default: NOW())   
expires_at: timestamptz  
**E2**: An index must be applied to the short_code column to ensure that redirect resolutions (looking up long_url by short_code) perform in $O(1)$ or $O(\log n)$ time, maintaining the required SLA.  

### Input Validation Guardrails
The system implements strict, layered input-validation routines on the backend to prevent corrupted records or malicious injection attacks from interacting with the data layer:
* **Syntactic Validation:** Rejects any input lacking explicit structural protocols. Returning:
    ```json
    { "error": "Invalid URL", "message": "URL must be a valid http:// or https:// address." }
    ```
* **Domain Validation & Resolution:** Intercepts structurally valid but non-existent web addresses by checking host availability before executing database persistence. Returning:
    ```json
    { "error": "Invalid URL", "message": "URL host could not be resolved. Please enter a valid URL." }
    ```

---

## Scenario 2: Analytics & Caching

### Requirement
Integrating analytical telemetry using Vercel Analytics to the existing frontend components and introducing Redis cache for redirection performance improvement

### Task Decomposition
**Enabler Story**  
**ES_003: Redis Cache Implementation**  
As an Engineering Team, we need to implement the integrate an in-memory Redis caching tier with a 24-hour Time-to-Live (TTL) into the redirection path, so that we can achieve O(1) read lookups, optimize response times under peak read amplification, and protect the Supabase PostgreSQL database from connection thrashing.  
**E1**: Cache-Aside Read: The route handler will intercept incoming requests at GET /:shortCode and query the Redis DB.  
Database Fallback: If a cache miss occurs, the system query must fall back to the Supabase PostgreSQL database.  
Non-Blocking Cache Populate: Upon a successful database retrieval, the system will trigger a background cache write (with a 24-hour TTL). Crucially, this operation must not be awaited, allowing the redirection response to be returned to the client instantly without waiting for the Redis network round-trip.

**ES_004: Vercel Analytics Integration**  
As an Engineering Team, we need to implement Vercel Analytics directly into the UI application layer to capture real-time client-side performance, session details, and geographic distribution without utilizing server compute resources.  
**E1**: Integrate Vercel Analytics injecting the required dependencies to capture client-side analytics.   

**User Stories:**
**US_005: Administrative Analytics Dashboard**  
As an Admin of this application, I want to view visitor analytics, page views, and bounce rates as a time-series graph directly within my Vercel account, so that I can monitor traffic trends and user engagement metrics to optimize the platform performance.  
_Acceptance Criteria:_
**AC1**: Given that Vercel Analytics is enabled for the project, when I log into the Vercel dashboard and navigate to the "Analytics" tab, then I must be able to view a time-series graph displaying Visitor counts, total Page Views, and Bounce Rates.  
**AC2**: Given that I am viewing the analytics graph, when I adjust the date-range picker, then the time-series graph must dynamically refresh to show the data corresponding to the selected timeframe.  
 
### Quality Gates & Testing Approach
To safely refactor the codebase for redis implementation and analytics integration, the following engineering quality gates were enforced:
* **Strict Type Auditing:** All updated modules were processed through the TypeScript compiler (`tsc --noEmit`) to guarantee that modifications to database schemas did not break existing controller contracts.
* **Automated Unit Testing:** The existing Unit test suite was run before and after code changes to verify that individual, isolated components of code work exactly as intended, covering all public methods and edge cases (invalid inputs, nulls, boundary conditions).
* **Functional Tests:** Test the individual user stories to ensure a working feature.  
* **Integration Tests:** Validates end-to-end request pipelines, verifying that a `POST` request correctly creates a record in Supabase that a subsequent `GET` request can successfully resolve.

---


### RAID Log (Risks, Assumptions, Issues, Dependencies)

| Category | ID | Item Description | Impact / Rationale | Mitigation / Resolution Strategy |
| :--- | :--- | :--- | :--- | :--- |
| **RISK** | **R_001** | **Data Scraping & Privacy:** Because the short codes are derived directly from a sequential database primary key, malicious actors or automated bots can run simple loops to sequentially guess every valid short URL in your system.| **High** | Accepted: Introduce Bit-Shuffling before encoding for Phase 2. |
| **RISK** | **R_002** | **Malicious URL Injections & XSS:** Users or automated bots might attempt to submit harmful scripts or malicious code payloads inside the text input fields. | **High** | Mitigated: Fastify’s internal schema-driven input validation engine intercepts incoming data at the application boundary, completely rejecting any text that violates strict URI formatting rules. |
| **ASSUMPTION** | **A_001** | **Managed Infrastructure Resiliency:** It is assumed that Supabase and Render will handle automatic connection pooling out of the box. | **Low** | Eliminates the immediate need to write custom connection throttling algorithms for this launch phase. |
| **DEPENDENCY** | **D_001** | **Database Schema Setup (ES_002) ➔ Base62 Utility Code (ES_001)** | **Hard Block** | The `Base62Service` class needs a steady sequence of auto-incrementing big integers (`id: int8`) generated by a live database table before it can calculate a unique link code. |
| **DEPENDENCY** | **D_002** | **Base62 Utility Code (ES_001) ➔ Core Creation Endpoint (US_003)** | **Hard Block** | The core link creation endpoint cannot process, map, or shorten web addresses until the mathematical conversion utility code is stable and imported. |
| **DEPENDENCY** | **D_003** | **Core Creation Endpoint (US_003) ➔ Redis Caching Tier (ES_003)** | **Architectural Flow** | The caching layer implementation requires a working creation route to generate valid test links so developers can verify cache hits, misses, and asynchronous background database updates. |





---

## Setup & Execution Instructions

### Prerequisites
* **Node.js Runtime:** v18.x or later installed locally.
* **Package Manager:** `npm`.
* **Database:** A valid PostgreSQL instance connection string (provided via Supabase).
* **Cache Provider:** An active Redis server endpoint instance.

### Step-by-Step Installation
1.  **Clone the project repository and open the project root directory:**
    ```bash
    git clone [https://github.com/soujatyaroy-web/url-shortener.git]([https://github.com/soujatyaroy-web/url-shortener.git])
    cd url-shortener
    ```
2.  **Install project dependencies:**
    ```bash
    npm install
    ```
3.  **Configure Environment Variables:**
    Duplicate the `.env.example` file and rename it to `.env`. Populate it with your active Supabase and Redis connection keys:
    ```bash
    # Open .env and add your SUPABASE_URL, SUPABASE_KEY, and REDIS_URL
    ```
4.  **Execute the local development server:**
    ```bash
    npm run dev
    ```
    ```bash
    npm run serve:frontend
    ```
5.  **Run the automated test suite:**
    ```bash
    npm run test
    ```

### API Reference & Usage Examples

#### Create a Shortened URL
```bash
Invoke-RestMethod -Method Post -Uri "http://localhost:3000/api/v1/shorten" `
  -Headers @{"Content-Type" = "application/json"} `
  -Body '{"long_url": "https://www.google.com"}'
