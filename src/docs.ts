// Documentation and UI functions

export function createLandingPage(baseUrl: string) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Riding Lookup API</title>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
            line-height: 1.5;
            color: #1a1a1a;
            background: #ffffff;
            font-size: 16px;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 60px 40px;
        }
        
        h1 {
            font-size: 32px;
            font-weight: 600;
            margin-bottom: 8px;
            letter-spacing: -0.02em;
        }
        
        .subtitle {
            font-size: 18px;
            color: #666;
            margin-bottom: 40px;
            font-weight: 400;
        }
        
        .section {
            margin-bottom: 32px;
        }
        
        .section h2 {
            font-size: 20px;
            font-weight: 600;
            margin-bottom: 16px;
            color: #1a1a1a;
        }
        
        .section h3 {
            font-size: 16px;
            font-weight: 600;
            margin: 24px 0 12px 0;
            color: #1a1a1a;
        }
        
        .endpoint {
            background: #f6f8fa;
            border: 1px solid #d0d7de;
            padding: 12px 16px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 14px;
            margin: 8px 0 12px 0;
            border-radius: 6px;
            color: #24292f;
            font-weight: 500;
        }
        
        .example {
            background: #ffffff;
            border: 1px solid #d0d7de;
            border-radius: 6px;
            margin: 16px 0;
            overflow: hidden;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
            padding: 16px;
            & h3 {
            margin-left: 16px;
            }
        }
        
        .example-tabs {
            display: flex;
            background: #f6f8fa;
            border-bottom: 1px solid #d0d7de;
            padding: 4px;
        }
        
        .example-tab {
            background: none;
            border: none;
            padding: 8px 16px;
            font-family: inherit;
            font-size: 13px;
            font-weight: 500;
            color: #656d76;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s ease;
            flex: 1;
            text-align: center;
        }
        
        .example-tab:hover {
            color: #24292f;
            background: #ffffff;
        }
        
        .example-tab.active {
            color: #24292f;
            background: #ffffff;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        
        .response-tabs {
            display: flex;
            background: #f6f8fa;
            border-top: 1px solid #d0d7de;
            padding: 4px;
            margin-top: 12px;
        }
        
        .response-tab {
            background: none;
            border: none;
            padding: 8px 16px;
            font-family: inherit;
            font-size: 13px;
            font-weight: 500;
            color: #656d76;
            cursor: pointer;
            border-radius: 4px;
            transition: all 0.2s ease;
            flex: 1;
            text-align: center;
        }
        
        .response-tab:hover {
            color: #24292f;
            background: #ffffff;
        }
        
        .response-tab.active {
            color: #24292f;
            background: #ffffff;
            box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
        }
        
        .response-content {
            display: none;
        }
        
        .response-content.active {
            display: block;
        }
        
        .example-content {
            display: none;
        }
        
        .example-content.active {
            display: block;
        }
        
        .example-code {
            background: #0d1117;
            color: #e6edf3;
            padding: 16px 20px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 14px;
            line-height: 1.5;
            border-radius: 6px;
            overflow-x: auto;
            margin: 0;
            border: 1px solid #30363d;
            position: relative;
        }
        
        .example-code::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 1px;
            background: linear-gradient(90deg, #ff7b72, #79c0ff, #a5d6ff, #ffa657, #f0f6fc);
        }
        
        .datasets {
            list-style: none;
        }
        
        .datasets li {
            padding: 8px 0;
            border-bottom: 1px solid #f0f0f0;
            font-size: 15px;
        }
        
        .datasets li:last-child {
            border-bottom: none;
        }
        
        .datasets strong {
            font-weight: 600;
            color: #1a1a1a;
        }
        
        .links {
            margin-top: 48px;
            padding-top: 32px;
            border-top: 1px solid #e1e5e9;
        }
        
        .links a {
            display: inline-block;
            margin-right: 24px;
            color: #0066cc;
            text-decoration: none;
            font-weight: 500;
            font-size: 15px;
        }
        
        .links a:hover {
            text-decoration: underline;
        }
        
        .note {
            background: #f0f8ff;
            border: 1px solid #b6e3ff;
            border-left: 4px solid #0969da;
            padding: 16px;
            margin: 24px 0;
            font-size: 14px;
            color: #0969da;
            border-radius: 6px;
        }
        
        .note code {
            background: #e1f5fe;
            color: #0969da;
            padding: 2px 6px;
            border-radius: 3px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 13px;
        }
        
        .response {
            background: #f8f9fa;
            border: 1px solid #e1e5e9;
            padding: 16px;
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-size: 13px;
            margin: 8px 0;
            border-radius: 4px;
            overflow-x: auto;
        }
        
        .endpoint-section {
            background: #ffffff;
            border: 1px solid #e1e5e9;
            border-radius: 8px;
            padding: 20px;
            margin: 16px 0;
            box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
        }
        
        .endpoint-header {
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 12px;
            flex-wrap: wrap;
        }
        
        .endpoint-section .method {
            background: #28a745;
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
        }
        
        .endpoint-section .method.post {
            background: #007bff;
        }
        
        .endpoint-section .url {
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            background: #f6f8fa;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 14px;
            font-weight: 500;
            color: #24292f;
        }
        
        .endpoint-section .description {
            font-weight: 600;
            color: #1a1a1a;
            font-size: 16px;
        }
        
        .endpoint-section p {
            margin: 8px 0;
            color: #666;
            line-height: 1.5;
        }
        
        .param-list {
            margin: 12px 0;
            padding: 12px;
            background: #f8f9fa;
            border-radius: 6px;
            border-left: 3px solid #007bff;
        }
        
        .param {
            margin: 4px 0;
            font-size: 14px;
        }
        
        .error-codes {
            background: #fff5f5;
            border: 1px solid #fed7d7;
            border-radius: 6px;
            padding: 16px;
            margin: 16px 0;
        }
        
        .error-codes h4 {
            color: #c53030;
            margin: 0 0 12px 0;
            font-size: 16px;
        }
        
        .error-code {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #fed7d7;
        }
        
        .error-code:last-child {
            border-bottom: none;
        }
        
        .error-code-name {
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            font-weight: 600;
            color: #c53030;
        }
        
        .error-code-desc {
            color: #666;
            font-size: 14px;
        }
        
        .rate-limits {
            background: #f0f8ff;
            border: 1px solid #b6e3ff;
            border-radius: 6px;
            padding: 16px;
            margin: 16px 0;
        }
        
        .rate-limits h4 {
            color: #0969da;
            margin: 0 0 12px 0;
            font-size: 16px;
        }
        
        .rate-limit-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 6px 0;
            border-bottom: 1px solid #b6e3ff;
        }
        
        .rate-limit-item:last-child {
            border-bottom: none;
        }
        
        .rate-limit-type {
            font-weight: 600;
            color: #0969da;
        }
        
        .rate-limit-value {
            font-family: 'SF Mono', Monaco, 'Cascadia Code', 'Roboto Mono', Consolas, 'Courier New', monospace;
            background: #e1f5fe;
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 13px;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Riding Lookup API</h1>
        <p class="subtitle">Find Canadian federal, provincial, and territorial ridings by location</p>
        
        <div class="section">
            <h2>Usage</h2>
            
            <div class="example">
                <h3>Postal Code</h3>
                <div class="endpoint">GET ${baseUrl}/api?postal=K1A 0A6</div>
                <div class="example-tabs">
                    <button class="example-tab active" data-type="curl">curl</button>
                    <button class="example-tab" data-type="fetch">fetch</button>
                    <button class="example-tab" data-type="python">python</button>
                </div>
                <div class="example-content active" data-type="curl">
                    <pre><code class="language-bash">curl "${baseUrl}/api?postal=K1A 0A6"</code></pre>
                </div>
                <div class="example-content" data-type="fetch">
                    <pre><code class="language-javascript">fetch("${baseUrl}/api?postal=K1A 0A6")
  .then(response => response.json())
  .then(data => console.log(data));</code></pre>
                </div>
                <div class="example-content" data-type="python">
                    <pre><code class="language-python">import requests

response = requests.get("${baseUrl}/api", params={"postal": "K1A 0A6"})
data = response.json()
print(data)</code></pre>
                </div>
                
                <div class="response-tabs">
                    <button class="response-tab active" data-type="success">Success</button>
                    <button class="response-tab" data-type="error">Error</button>
                </div>
                <div class="response-content active" data-type="success">
                    <pre><code class="language-json">{
  "query": {"postal": "K1A 0A6"},
  "point": {"lon": -75.6972, "lat": 45.4215},
  "properties": {
    "FED_NUM": "35047",
    "FED_NAME": "Ottawa Centre",
    "PROV_TERR": "Ontario"
  }
}</code></pre>
                </div>
                <div class="response-content" data-type="error">
                    <pre><code class="language-json">{
  "error": "Invalid postal code format",
  "code": "INVALID_POSTAL_CODE"
}</code></pre>
                </div>
            </div>
            
            <div class="example">
                <h3>Address</h3>
                <div class="endpoint">GET ${baseUrl}/api?address=123 Main St Toronto</div>
                <div class="example-tabs">
                    <button class="example-tab active" data-type="curl">curl</button>
                    <button class="example-tab" data-type="fetch">fetch</button>
                    <button class="example-tab" data-type="python">python</button>
                </div>
                <div class="example-content active" data-type="curl">
                    <pre><code class="language-bash">curl "${baseUrl}/api?address=123%20Main%20St%20Toronto"</code></pre>
                </div>
                <div class="example-content" data-type="fetch">
                    <pre><code class="language-javascript">fetch("${baseUrl}/api?address=123%20Main%20St%20Toronto")
  .then(response => response.json())
  .then(data => console.log(data));</code></pre>
                </div>
                <div class="example-content" data-type="python">
                    <pre><code class="language-python">import requests

response = requests.get("${baseUrl}/api", params={"address": "123 Main St Toronto"})
data = response.json()
print(data)</code></pre>
                </div>
                
                <div class="response-tabs">
                    <button class="response-tab active" data-type="success">Success</button>
                    <button class="response-tab" data-type="error">Error</button>
                </div>
                <div class="response-content active" data-type="success">
                    <pre><code class="language-json">{
  "query": {"address": "123 Main St Toronto"},
  "point": {"lon": -79.3832, "lat": 43.6532},
  "properties": {
    "FED_NUM": "35039",
    "FED_NAME": "Toronto Centre",
    "PROV_TERR": "Ontario"
  }
}</code></pre>
                </div>
                <div class="response-content" data-type="error">
                    <pre><code class="language-json">{
  "error": "Address not found",
  "code": "GEOCODING_FAILED"
}</code></pre>
                </div>
            </div>
            
            <div class="example">
                <h3>Coordinates</h3>
                <div class="endpoint">GET ${baseUrl}/api?lat=45.4215&lon=-75.6972</div>
                <div class="example-tabs">
                    <button class="example-tab active" data-type="curl">curl</button>
                    <button class="example-tab" data-type="fetch">fetch</button>
                    <button class="example-tab" data-type="python">python</button>
                </div>
                <div class="example-content active" data-type="curl">
                    <pre><code class="language-bash">curl "${baseUrl}/api?lat=45.4215&lon=-75.6972"</code></pre>
                </div>
                <div class="example-content" data-type="fetch">
                    <pre><code class="language-javascript">fetch("${baseUrl}/api?lat=45.4215&lon=-75.6972")
  .then(response => response.json())
  .then(data => console.log(data));</code></pre>
                </div>
                <div class="example-content" data-type="python">
                    <pre><code class="language-python">import requests

response = requests.get("${baseUrl}/api", params={"lat": 45.4215, "lon": -75.6972})
data = response.json()
print(data)</code></pre>
                </div>
                
                <div class="response-tabs">
                    <button class="response-tab active" data-type="success">Success</button>
                    <button class="response-tab" data-type="error">Error</button>
                </div>
                <div class="response-content active" data-type="success">
                    <pre><code class="language-json">{
  "query": {"lat": 45.4215, "lon": -75.6972},
  "point": {"lon": -75.6972, "lat": 45.4215},
  "properties": {
    "FED_NUM": "35047",
    "FED_NAME": "Ottawa Centre",
    "PROV_TERR": "Ontario"
  }
}</code></pre>
                </div>
                <div class="response-content" data-type="error">
                    <pre><code class="language-json">{
  "error": "Invalid coordinates",
  "code": "INVALID_COORDINATES"
}</code></pre>
                </div>
            </div>
        </div>

        <div class="section">
            <h2>API Endpoints</h2>
            
            <h3>Core Lookup Endpoints</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api</span>
                    <span class="description">Federal Riding Lookup (alias)</span>
                </div>
                <p>Alias of <code>/api/federal</code>. Find the federal riding for any location in Canada. Supports postal codes, addresses, and coordinates. Returns riding information including FED_NUM, FED_NAME, and PROV_TERR.</p>
                <div class="param-list">
                    <div class="param"><strong>postal</strong> - Canadian postal code (e.g., "K1A 0A6")</div>
                    <div class="param"><strong>address</strong> - Full address to geocode</div>
                    <div class="param"><strong>lat/lon</strong> - Latitude and longitude coordinates</div>
                    <div class="param"><strong>city/state/country</strong> - Location components</div>
                </div>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/federal</span>
                    <span class="description">Federal Riding Lookup</span>
                </div>
                <p>Canonical federal riding lookup (2024 boundaries). Same behavior as <code>/api</code>.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/combined</span>
                    <span class="description">Federal + Ontario or Quebec Provincial</span>
                </div>
                <p>Returns federal riding data plus <code>province_data</code> when the federal feature’s PROV_TERR is Ontario or Quebec (supports abbreviations and full names).</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/qc</span>
                    <span class="description">Quebec Provincial Riding Lookup</span>
                </div>
                <p>Find the Quebec provincial riding for any location in Quebec. Uses the 2025 Quebec provincial riding boundaries.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/on</span>
                    <span class="description">Ontario Provincial Riding Lookup</span>
                </div>
                <p>Find the Ontario provincial riding for any location in Ontario. Uses the 2022 Ontario provincial riding boundaries.</p>
            </div>

            <h3>ODA Geolocation (Self-Hosted)</h3>
            <p>When <code>ODA_GEOCODING_ENABLED=true</code>, these endpoints use Statistics Canada's Open Database of Addresses. See <code>docs/oda-geolocation-contract.md</code>.</p>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/geocode</span>
                    <span class="description">Forward geocode via ODA</span>
                </div>
            </div>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/reverse</span>
                    <span class="description">Reverse geocode via ODA</span>
                </div>
            </div>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/normalize-address</span>
                    <span class="description">Canada Post-style address normalization</span>
                </div>
            </div>

            <h3>Batch Processing</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">POST</span>
                    <span class="url">/batch</span>
                    <span class="description">Immediate Batch Processing</span>
                </div>
                <p>Process multiple lookup requests immediately using Google Maps batch geocoding for optimal performance. Supports up to 100 requests per batch.</p>
                
                <h4>Example Request</h4>
                <pre><code class="language-bash">curl -X POST "${baseUrl}/batch" \\
  -H "Content-Type: application/json" \\
  -d '{
    "requests": [
      {
        "id": "1",
        "pathname": "/api",
        "query": {"postal": "K1A 0A6"}
      },
      {
        "id": "2", 
        "pathname": "/api",
        "query": {"address": "123 Main St Toronto"}
      }
    ]
  }'</code></pre>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">POST</span>
                    <span class="url">/api/queue/submit</span>
                    <span class="description">Queue Batch for Processing</span>
                </div>
                <p>Submit a batch of requests to the persistent queue for asynchronous processing. Returns immediately with a batch ID for status tracking.</p>
                
                <h4>Example Request</h4>
                <pre><code class="language-bash">curl -X POST "${baseUrl}/api/queue/submit" \\
  -H "Content-Type: application/json" \\
  -d '{
    "requests": [
      {
        "id": "1",
        "pathname": "/api",
        "query": {"postal": "K1A 0A6"}
      },
      {
        "id": "2",
        "pathname": "/api/qc", 
        "query": {"address": "1234 Rue Saint-Denis, Montréal"}
      }
    ]
  }'</code></pre>
                
                <h4>Example Response</h4>
                <pre><code class="language-json">{
  "batchId": "batch_1234567890",
  "status": "pending",
  "message": "Batch submitted successfully"
}</code></pre>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/queue/status</span>
                    <span class="description">Check Batch Status</span>
                </div>
                <p>Check the status of a queued batch including completion progress and results. Use the batchId returned from queue submission.</p>
                
                <h4>Example Request</h4>
                <pre><code class="language-bash">curl "${baseUrl}/api/queue/status?batchId=batch_1234567890"</code></pre>
                
                <h4>Example Response</h4>
                <pre><code class="language-json">{
  "batchId": "batch_1234567890",
  "status": "completed",
  "progress": {
    "total": 2,
    "completed": 2,
    "failed": 0,
    "pending": 0
  },
  "results": [
    {
      "id": "1",
      "query": {"postal": "K1A 0A6"},
      "point": {"lon": -75.6972, "lat": 45.4215},
      "properties": {
        "FED_NUM": "35047",
        "FED_NAME": "Ottawa Centre",
        "PROV_TERR": "Ontario"
      },
      "processingTime": 150
    }
  ],
  "createdAt": "2024-01-15T10:30:00Z",
  "updatedAt": "2024-01-15T10:30:05Z"
}</code></pre>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/queue/stats</span>
                    <span class="description">Queue Statistics</span>
                </div>
                <p>Get comprehensive statistics about the queue including job counts, processing times, and success rates.</p>
            </div>

            <h3>Database Operations</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">POST</span>
                    <span class="url">/api/database/init</span>
                    <span class="description">Initialize Spatial Database</span>
                </div>
                <p>Initialize the spatial database with required tables and indexes for optimal performance.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">POST</span>
                    <span class="url">/api/database/sync</span>
                    <span class="description">Sync GeoJSON to Database</span>
                </div>
                <p>Synchronize GeoJSON data to the spatial database for faster lookups.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/database/stats</span>
                    <span class="description">Database Statistics</span>
                </div>
                <p>Get statistics about the spatial database including feature counts and sync status.</p>
            </div>

            <h3>Boundary Data</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/boundaries/lookup</span>
                    <span class="description">Lookup Boundaries by Coordinates</span>
                </div>
                <p>Find boundaries using coordinates with optional dataset selection. Useful for direct database queries.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/boundaries/all</span>
                    <span class="description">Get All Boundaries</span>
                </div>
                <p>Retrieve all boundaries from the database with pagination support.</p>
            </div>

            <h3>System & Monitoring</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/health</span>
                    <span class="description">Health Check</span>
                </div>
                <p>Get comprehensive health status including metrics, circuit breakers, and cache warming status.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/metrics</span>
                    <span class="description">Performance Metrics</span>
                </div>
                <p>Get detailed performance metrics and statistics for monitoring and optimization.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/cache-warming</span>
                    <span class="description">Cache Warming Status</span>
                </div>
                <p>Get current cache warming status and configuration for performance optimization.</p>
            </div>

            <h3>Webhook Management</h3>
            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET/POST</span>
                    <span class="url">/api/webhooks</span>
                    <span class="description">Webhook Management</span>
                </div>
                <p>List and create webhook configurations for event notifications.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/webhooks/events</span>
                    <span class="description">Webhook Events</span>
                </div>
                <p>Get webhook events with optional filtering by status and webhook ID.</p>
            </div>

            <div class="endpoint-section">
                <div class="endpoint-header">
                    <span class="method">GET</span>
                    <span class="url">/api/webhooks/deliveries</span>
                    <span class="description">Webhook Deliveries</span>
                </div>
                <p>Get webhook delivery attempts with detailed status information.</p>
            </div>
        </div>

        <div class="section">
            <h2>Datasets</h2>
            <ul class="datasets">
                <li><strong>/api/federal</strong> (alias <strong>/api</strong>) — Federal ridings (338 ridings)</li>
                <li><strong>/api/combined</strong> — Federal plus matching ON/QC provincial result</li>
                <li><strong>/api/qc</strong> — Quebec provincial ridings (125 ridings)</li>
                <li><strong>/api/on</strong> — Ontario provincial ridings (124 ridings)</li>
            </ul>
            <p>Have a dataset you'd like to see supported? <a href="https://github.com/wra-sol/ridingLookup/issues/new">Open an issue</a> and we'll add it to the list.</p>
            <p>Want to contribute a dataset? <a href="https://github.com/wra-sol/ridingLookup/blob/main/docs/CONTRIBUTING.md">Read the contribution guidelines</a> and submit a pull request.</p>
        </div>

        <div class="section">
            <h2>Authentication</h2>
            <p>This API supports two authentication methods:</p>
            
            <h3>Basic Authentication</h3>
            <pre><code class="language-bash">curl -u "username:password" "${baseUrl}/api?postal=K1A 0A6"</code></pre>
            
            <h3>Google Maps API Key (BYOK)</h3>
            <p>Use your own Google Maps API key to bypass basic authentication:</p>
            <pre><code class="language-bash">curl -H "X-Google-API-Key: YOUR_KEY" "${baseUrl}/api?address=123 Main St"</code></pre>
            
            <div class="note">
                <strong>Note:</strong> When using the X-Google-API-Key header, basic authentication is automatically bypassed, allowing users to use their own Google API key without needing the configured basic auth credentials.
            </div>
        </div>

        <div class="section">
            <h2>Rate Limiting & Performance</h2>
            <div class="rate-limits">
                <h4>Rate Limits</h4>
                <div class="rate-limit-item">
                    <span class="rate-limit-type">Standard Requests</span>
                    <span class="rate-limit-value">100 requests/minute</span>
                </div>
                <div class="rate-limit-item">
                    <span class="rate-limit-type">Batch Processing</span>
                    <span class="rate-limit-value">10 requests per batch</span>
                </div>
                <div class="rate-limit-item">
                    <span class="rate-limit-type">Queue Processing</span>
                    <span class="rate-limit-value">Unlimited (async)</span>
                </div>
            </div>
            
            <h3>Timeouts</h3>
            <ul>
                <li><strong>Single lookups:</strong> 10s for geocoding, 5s for riding lookup</li>
                <li><strong>Batch operations:</strong> 30s total processing time</li>
                <li><strong>Maximum request timeout:</strong> 60s</li>
            </ul>
        </div>

        <div class="section">
            <h2>Error Codes</h2>
            <div class="error-codes">
                <h4>Common Error Responses</h4>
                <div class="error-code">
                    <span class="error-code-name">INVALID_POSTAL_CODE</span>
                    <span class="error-code-desc">Postal code format is invalid</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">GEOCODING_FAILED</span>
                    <span class="error-code-desc">Address could not be geocoded</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">INVALID_COORDINATES</span>
                    <span class="error-code-desc">Latitude/longitude values are invalid</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">RIDING_NOT_FOUND</span>
                    <span class="error-code-desc">No riding found for the given location</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">RATE_LIMIT_EXCEEDED</span>
                    <span class="error-code-desc">Too many requests, please slow down</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">AUTHENTICATION_REQUIRED</span>
                    <span class="error-code-desc">Valid credentials or API key required</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">BATCH_SIZE_EXCEEDED</span>
                    <span class="error-code-desc">Batch contains too many requests (max 100)</span>
                </div>
                <div class="error-code">
                    <span class="error-code-name">CIRCUIT_BREAKER_OPEN</span>
                    <span class="error-code-desc">Service temporarily unavailable due to high error rate</span>
                </div>
            </div>
        </div>


        <div class="links">
            <a href="${baseUrl}/swagger" target="_blank">API Documentation</a>
            <a href="${baseUrl}/api/docs" target="_blank">OpenAPI Spec</a>
            <a href="https://github.com/wra-sol/ridingLookup" target="_blank">GitHub</a>
        </div>
    </div>

    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
    <script>
        // Tab switching functionality
        document.addEventListener('DOMContentLoaded', function() {
            // Initialize Prism syntax highlighting
            if (typeof Prism !== 'undefined') {
                Prism.highlightAll();
            }
            // Get preferred language from URL params, default to curl
            const urlParams = new URLSearchParams(window.location.search);
            const preferredLang = urlParams.get('lang') || 'curl';
            
            // Function to set all examples to a specific language
            function setAllExamplesToLanguage(lang) {
                document.querySelectorAll('.example').forEach(example => {
                    const tabs = example.querySelectorAll('.example-tab');
                    const contents = example.querySelectorAll('.example-content');
                    
                    // Remove active classes
                    tabs.forEach(tab => tab.classList.remove('active'));
                    contents.forEach(content => content.classList.remove('active'));
                    
                    // Set preferred language as active
                    const activeTab = example.querySelector('[data-type="' + lang + '"]');
                    const activeContent = example.querySelector('[data-type="' + lang + '"].example-content');
                    
                    if (activeTab && activeContent) {
                        activeTab.classList.add('active');
                        activeContent.classList.add('active');
                    } else {
                        // Fallback to curl if preferred language not found
                        const curlTab = example.querySelector('[data-type="curl"]');
                        const curlContent = example.querySelector('[data-type="curl"].example-content');
                        if (curlTab && curlContent) {
                            curlTab.classList.add('active');
                            curlContent.classList.add('active');
                        }
                    }
                });
            }
            
            // Initialize with preferred language
            setAllExamplesToLanguage(preferredLang);
            
            // Add click handlers to all example tabs
            document.querySelectorAll('.example-tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const type = this.getAttribute('data-type');
                    
                    // Update URL with language preference
                    const url = new URL(window.location);
                    url.searchParams.set('lang', type);
                    window.history.replaceState({}, '', url);
                    
                    // Update ALL examples to use the selected language
                    setAllExamplesToLanguage(type);
                    
                    // Re-highlight code after tab switch
                    if (typeof Prism !== 'undefined') {
                        Prism.highlightAll();
                    }
                });
            });
            
            // Add click handlers to all response tabs
            document.querySelectorAll('.response-tab').forEach(tab => {
                tab.addEventListener('click', function() {
                    const example = this.closest('.example');
                    const type = this.getAttribute('data-type');
                    
                    // Update response tabs in this example only
                    example.querySelectorAll('.response-tab').forEach(t => t.classList.remove('active'));
                    example.querySelectorAll('.response-content').forEach(c => c.classList.remove('active'));
                    
                    // Activate selected tab and content
                    this.classList.add('active');
                    example.querySelector('[data-type="' + type + '"].response-content').classList.add('active');
                    
                    // Re-highlight code after response tab switch
                    if (typeof Prism !== 'undefined') {
                        Prism.highlightAll();
                    }
                });
            });
        });
    </script>
</body>
</html>`;
}

export function createSwaggerUI(baseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Riding Lookup API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui.css" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
  <style>
    html {
      box-sizing: border-box;
      overflow: -moz-scrollbars-vertical;
      overflow-y: scroll;
    }
    *, *:before, *:after {
      box-sizing: inherit;
    }
    body {
      margin:0;
      background: #fafafa;
    }
    .swagger-ui .topbar {
      display: none;
    }
.swagger-ui .wrapper span:last-child div.opblock-tag-section:last-child {
      padding-top: 0;
      padding-bottom: 40px;
    }
}
  </style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-bundle.js"></script>
  <script src="https://unpkg.com/swagger-ui-dist@4.15.5/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      const ui = SwaggerUIBundle({
        url: '${baseUrl}/api/docs',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        plugins: [
          SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout"
      });
    };
  </script>
</body>
</html>`;
}

export function createOpenAPISpec(baseUrl: string) {
  return {
    openapi: "3.0.0",
    info: {
      title: "Riding Lookup API",
      description:
        "Find Canadian federal, provincial, and territorial ridings by location. Uses GeoGratis Geolocation API (Government of Canada) as the primary geocoding service, with automatic fallback to Google Maps (BYOK), Mapbox, or Nominatim when needed. Features Google Maps batch geocoding for optimal performance and cost efficiency. Built on Cloudflare Workers for global edge performance.",
      version: "1.0.0",
      contact: {
        name: "API Support",
        url: "https://github.com",
        email: "support@example.com",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: baseUrl,
        description: "Production server",
      },
    ],
    paths: {
      "/api": {
        get: {
          summary: "Lookup federal riding by location (alias)",
          description:
            "Alias of /api/federal. Find the federal riding for a given location using postal code, address, or coordinates",
          tags: ["Federal Ridings"],
          parameters: [
            {
              name: "postal",
              in: "query",
              description: "Canadian postal code (e.g., K1A 0A6)",
              required: false,
              schema: { type: "string", example: "K1A 0A6" },
            },
            {
              name: "address",
              in: "query",
              description: "Street address",
              required: false,
              schema: { type: "string", example: "123 Main St, Toronto, ON" },
            },
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: false,
              schema: { type: "number", example: 45.4215 },
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: false,
              schema: { type: "number", example: -75.6972 },
            },
            {
              name: "city",
              in: "query",
              description: "City name",
              required: false,
              schema: { type: "string", example: "Toronto" },
            },
            {
              name: "state",
              in: "query",
              description: "Province or state",
              required: false,
              schema: { type: "string", example: "Ontario" },
            },
            {
              name: "country",
              in: "query",
              description: "Country",
              required: false,
              schema: { type: "string", example: "Canada" },
            },
          ],
          responses: {
            "200": {
              description: "Successful lookup",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: {
                        type: "object",
                        description: "The query parameters used",
                      },
                      point: {
                        type: "object",
                        properties: {
                          lon: { type: "number" },
                          lat: { type: "number" },
                        },
                        description: "Geocoded coordinates",
                      },
                      properties: {
                        type: "object",
                        description:
                          "Riding properties including FED_NUM, FED_NAME, etc.",
                        nullable: true,
                      },
                    },
                  },
                  example: {
                    query: { postal: "K1A 0A6" },
                    point: { lon: -75.6972, lat: 45.4215 },
                    properties: {
                      FED_NUM: "35047",
                      FED_NAME: "Ottawa Centre",
                      PROV_TERR: "Ontario",
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - invalid parameters",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized - missing or invalid authentication",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      retryAfter: { type: "number" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/federal": {
        get: {
          summary: "Lookup federal riding by location",
          description:
            "Find the federal riding for a given location using postal code, address, or coordinates",
          tags: ["Federal Ridings"],
          parameters: [
            {
              name: "postal",
              in: "query",
              description: "Canadian postal code (e.g., K1A 0A6)",
              required: false,
              schema: { type: "string", example: "K1A 0A6" },
            },
            {
              name: "address",
              in: "query",
              description: "Street address",
              required: false,
              schema: { type: "string", example: "123 Main St, Toronto, ON" },
            },
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: false,
              schema: { type: "number", example: 45.4215 },
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: false,
              schema: { type: "number", example: -75.6972 },
            },
            {
              name: "city",
              in: "query",
              description: "City name",
              required: false,
              schema: { type: "string", example: "Toronto" },
            },
            {
              name: "state",
              in: "query",
              description: "Province or state",
              required: false,
              schema: { type: "string", example: "Ontario" },
            },
            {
              name: "country",
              in: "query",
              description: "Country",
              required: false,
              schema: { type: "string", example: "Canada" },
            },
          ],
          responses: {
            "200": {
              description: "Successful lookup",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: {
                        type: "object",
                        description: "The query parameters used",
                      },
                      point: {
                        type: "object",
                        properties: {
                          lon: { type: "number" },
                          lat: { type: "number" },
                        },
                        description: "Geocoded coordinates",
                      },
                      properties: {
                        type: "object",
                        description:
                          "Riding properties including FED_NUM, FED_NAME, etc.",
                        nullable: true,
                      },
                    },
                  },
                  example: {
                    query: { postal: "K1A 0A6" },
                    point: { lon: -75.6972, lat: 45.4215 },
                    properties: {
                      FED_NUM: "35047",
                      FED_NAME: "Ottawa Centre",
                      PROV_TERR: "Ontario",
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - invalid parameters",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized - missing or invalid authentication",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      retryAfter: { type: "number" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/combined": {
        get: {
          summary: "Lookup federal and provincial ridings in one call",
          description:
            "Returns the federal result plus the matching provincial result (Ontario or Quebec) in `province_data` when PROV_TERR maps to those provinces.",
          tags: ["Combined Lookup"],
          parameters: [
            {
              name: "postal",
              in: "query",
              description: "Canadian postal code (e.g., K1A 0A6)",
              required: false,
              schema: { type: "string", example: "K1A 0A6" },
            },
            {
              name: "address",
              in: "query",
              description: "Street address",
              required: false,
              schema: { type: "string", example: "123 Main St, Toronto, ON" },
            },
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: false,
              schema: { type: "number", example: 45.4215 },
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: false,
              schema: { type: "number", example: -75.6972 },
            },
            {
              name: "city",
              in: "query",
              description: "City name",
              required: false,
              schema: { type: "string", example: "Toronto" },
            },
            {
              name: "state",
              in: "query",
              description: "Province or state",
              required: false,
              schema: { type: "string", example: "Ontario" },
            },
            {
              name: "country",
              in: "query",
              description: "Country",
              required: false,
              schema: { type: "string", example: "Canada" },
            },
          ],
          responses: {
            "200": {
              description: "Successful lookup (federal + optional provincial)",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: { type: "object" },
                      point: {
                        type: "object",
                        properties: {
                          lon: { type: "number" },
                          lat: { type: "number" },
                        },
                      },
                      riding: { type: "string" },
                      properties: { type: "object", nullable: true },
                      province_data: {
                        type: "object",
                        nullable: true,
                        properties: {
                          riding: { type: "string" },
                          properties: { type: "object" },
                          dataset: {
                            type: "string",
                            enum: ["ontarioridings-2022", "quebecridings-2025"],
                          },
                        },
                      },
                      normalizedAddress: { type: "string" },
                      addressComponents: { type: "object" },
                    },
                  },
                  example: {
                    query: { address: "123 Main St, Toronto" },
                    point: { lon: -79.3832, lat: 43.6532 },
                    riding: "Toronto Centre",
                    properties: { FED_NUM: "35075", PROV_TERR: "Ontario" },
                    province_data: {
                      riding: "Toronto Centre",
                      properties: { PR_NUM: "082" },
                      dataset: "ontarioridings-2022",
                    },
                  },
                },
              },
            },
            "400": {
              description: "Bad request - invalid parameters",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "401": {
              description: "Unauthorized - missing or invalid authentication",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                    },
                  },
                },
              },
            },
            "429": {
              description: "Rate limit exceeded",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      error: { type: "string" },
                      retryAfter: { type: "number" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/qc": {
        get: {
          summary: "Lookup Quebec provincial riding by location",
          description: "Find the Quebec provincial riding for a given location",
          tags: ["Quebec Ridings"],
          parameters: [
            {
              name: "postal",
              in: "query",
              description: "Canadian postal code (e.g., H2Y 1C6)",
              required: false,
              schema: { type: "string", example: "H2Y 1C6" },
            },
            {
              name: "address",
              in: "query",
              description: "Street address",
              required: false,
              schema: {
                type: "string",
                example: "1234 Rue Saint-Denis, Montréal, QC",
              },
            },
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: false,
              schema: { type: "number", example: 45.5017 },
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: false,
              schema: { type: "number", example: -73.5673 },
            },
          ],
          responses: {
            "200": {
              description: "Successful lookup",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: { type: "object" },
                      point: {
                        type: "object",
                        properties: {
                          lon: { type: "number" },
                          lat: { type: "number" },
                        },
                      },
                      properties: {
                        type: "object",
                        nullable: true,
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/on": {
        get: {
          summary: "Lookup Ontario provincial riding by location",
          description:
            "Find the Ontario provincial riding for a given location",
          tags: ["Ontario Ridings"],
          parameters: [
            {
              name: "postal",
              in: "query",
              description: "Canadian postal code (e.g., M5H 2N2)",
              required: false,
              schema: { type: "string", example: "M5H 2N2" },
            },
            {
              name: "address",
              in: "query",
              description: "Street address",
              required: false,
              schema: { type: "string", example: "123 King St, Toronto, ON" },
            },
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: false,
              schema: { type: "number", example: 43.6532 },
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: false,
              schema: { type: "number", example: -79.3832 },
            },
          ],
          responses: {
            "200": {
              description: "Successful lookup",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      query: { type: "object" },
                      point: {
                        type: "object",
                        properties: {
                          lon: { type: "number" },
                          lat: { type: "number" },
                        },
                      },
                      properties: {
                        type: "object",
                        nullable: true,
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/geocode": {
        get: {
          summary: "Forward geocode using ODA",
          description: "Geocode an address or postal code using the self-hosted ODA database. Requires ODA_GEOCODING_ENABLED.",
          tags: ["ODA Geolocation"],
          parameters: [
            { name: "address", in: "query", schema: { type: "string" } },
            { name: "postal", in: "query", schema: { type: "string" } },
            { name: "city", in: "query", schema: { type: "string" } },
            { name: "state", in: "query", schema: { type: "string" } },
          ],
          responses: {
            "200": { description: "Geocode result with confidence and mailingAddress" },
            "422": { description: "AMBIGUOUS_LOCATION or LOW_CONFIDENCE_GEOCODE" },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/reverse": {
        get: {
          summary: "Reverse geocode using ODA",
          tags: ["ODA Geolocation"],
          parameters: [
            { name: "lat", in: "query", required: true, schema: { type: "number" } },
            { name: "lon", in: "query", required: true, schema: { type: "number" } },
          ],
          responses: {
            "200": { description: "Nearest ODA address with distanceMeters" },
            "404": { description: "NO_NEARBY_ADDRESS" },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/normalize-address": {
        get: {
          summary: "Normalize address to Canada Post-style format",
          tags: ["ODA Geolocation"],
          parameters: [
            { name: "address", in: "query", schema: { type: "string" } },
            { name: "postal", in: "query", schema: { type: "string" } },
          ],
          responses: { "200": { description: "Normalized mailing address" } },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/oda/init": {
        post: {
          summary: "Initialize ODA database schema",
          tags: ["ODA Admin"],
          responses: { "200": { description: "Schema initialized" } },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/oda/stats": {
        get: {
          summary: "ODA database statistics",
          tags: ["ODA Admin"],
          responses: { "200": { description: "Row counts and import metadata" } },
          security: [{ basicAuth: [] }],
        },
      },
      "/batch": {
        post: {
          summary: "Process batch of lookup requests",
          description: "Process multiple lookup requests in a single call",
          tags: ["Batch Processing"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requests: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          pathname: {
                            type: "string",
                            enum: ["/api", "/api/federal", "/api/combined", "/api/qc", "/api/on"],
                          },
                          query: {
                            type: "object",
                            properties: {
                              postal: { type: "string" },
                              address: { type: "string" },
                              lat: { type: "number" },
                              lon: { type: "number" },
                              city: { type: "string" },
                              state: { type: "string" },
                              country: { type: "string" },
                            },
                          },
                        },
                        required: ["id", "pathname", "query"],
                      },
                    },
                  },
                  required: ["requests"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Batch processing completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            query: { type: "object" },
                            point: { type: "object", nullable: true },
                            properties: { type: "object", nullable: true },
                            error: { type: "string" },
                            processingTime: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/queue/submit": {
        post: {
          summary: "Submit Batch to Queue",
          description:
            "Submit a batch of riding lookups to the persistent queue for asynchronous processing. Returns immediately with batch ID for status tracking.",
          tags: ["Queue Operations"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    requests: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          id: { type: "string" },
                          pathname: {
                            type: "string",
                            enum: ["/api", "/api/federal", "/api/combined", "/api/qc", "/api/on"],
                          },
                          query: {
                            type: "object",
                            properties: {
                              postal: { type: "string" },
                              address: { type: "string" },
                              lat: { type: "number" },
                              lon: { type: "number" },
                              city: { type: "string" },
                              state: { type: "string" },
                              country: { type: "string" },
                            },
                          },
                        },
                        required: ["id", "pathname", "query"],
                      },
                    },
                  },
                  required: ["requests"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Batch submitted successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      batchId: { type: "string" },
                      status: { type: "string" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/queue/status": {
        get: {
          summary: "Get Batch Status",
          description:
            "Check the status of a submitted batch job including completion progress and results.",
          tags: ["Queue Operations"],
          parameters: [
            {
              name: "batchId",
              in: "query",
              description: "The batch ID returned from queue submission",
              required: true,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Batch status retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      batchId: { type: "string" },
                      status: {
                        type: "string",
                        enum: ["pending", "processing", "completed", "failed"],
                      },
                      progress: {
                        type: "object",
                        properties: {
                          total: { type: "number" },
                          completed: { type: "number" },
                          failed: { type: "number" },
                          pending: { type: "number" },
                        },
                      },
                      results: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            query: { type: "object" },
                            point: { type: "object", nullable: true },
                            properties: { type: "object", nullable: true },
                            error: { type: "string" },
                            processingTime: { type: "number" },
                          },
                        },
                      },
                      createdAt: { type: "string", format: "date-time" },
                      updatedAt: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/queue/stats": {
        get: {
          summary: "Get Queue Statistics",
          description:
            "Get comprehensive statistics about the queue including job counts, processing times, and success rates.",
          tags: ["Queue Operations"],
          responses: {
            "200": {
              description: "Queue statistics retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      totalBatches: { type: "number" },
                      pendingBatches: { type: "number" },
                      processingBatches: { type: "number" },
                      completedBatches: { type: "number" },
                      failedBatches: { type: "number" },
                      totalJobs: { type: "number" },
                      pendingJobs: { type: "number" },
                      completedJobs: { type: "number" },
                      failedJobs: { type: "number" },
                      averageProcessingTime: { type: "number" },
                      successRate: { type: "number" },
                      lastUpdated: { type: "string", format: "date-time" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/queue/process": {
        post: {
          summary: "Process Queue Jobs",
          description:
            "Process pending jobs from the queue. This endpoint is typically called by worker processes.",
          tags: ["Queue Operations"],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    maxJobs: {
                      type: "number",
                      description:
                        "Maximum number of jobs to process (default: 10)",
                      default: 10,
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Queue processing completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      processed: { type: "number" },
                      successful: { type: "number" },
                      failed: { type: "number" },
                      results: { type: "array" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }, { apiKey: [] }],
        },
      },
      "/api/database/init": {
        post: {
          summary: "Initialize Spatial Database",
          description:
            "Initialize the spatial database with required tables and indexes",
          tags: ["Database Operations"],
          responses: {
            "200": {
              description: "Database initialization completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/database/sync": {
        post: {
          summary: "Sync GeoJSON to Database",
          description: "Synchronize GeoJSON data to the spatial database",
          tags: ["Database Operations"],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    dataset: {
                      type: "string",
                      enum: [
                        "federalridings-2024.geojson",
                        "quebecridings-2025.geojson",
                        "ontarioridings-2022.geojson",
                      ],
                      default: "federalridings-2024.geojson",
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Database sync completed",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      success: { type: "boolean" },
                      message: { type: "string" },
                      dataset: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/database/stats": {
        get: {
          summary: "Get Database Statistics",
          description: "Get statistics about the spatial database",
          tags: ["Database Operations"],
          responses: {
            "200": {
              description: "Database statistics retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      features: { type: "number" },
                      lastSync: {
                        type: "string",
                        format: "date-time",
                        nullable: true,
                      },
                      status: { type: "string", enum: ["active", "disabled"] },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/database/query": {
        get: {
          summary: "Query Database Directly",
          description: "Query the spatial database directly by coordinates",
          tags: ["Database Operations"],
          parameters: [
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: true,
              schema: { type: "number", example: 45.4215 },
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: true,
              schema: { type: "number", example: -75.6972 },
            },
            {
              name: "dataset",
              in: "query",
              description: "Dataset to query",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "federalridings-2024.geojson",
                  "quebecridings-2025.geojson",
                  "ontarioridings-2022.geojson",
                ],
                default: "federalridings-2024.geojson",
              },
            },
          ],
          responses: {
            "200": {
              description: "Database query successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      type: { type: "string" },
                      properties: { type: "object" },
                      geometry: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/boundaries/lookup": {
        get: {
          summary: "Lookup Boundaries by Coordinates",
          description:
            "Find boundaries using coordinates with optional dataset selection",
          tags: ["Boundaries"],
          parameters: [
            {
              name: "lat",
              in: "query",
              description: "Latitude",
              required: true,
              schema: { type: "number", example: 45.4215 },
            },
            {
              name: "lon",
              in: "query",
              description: "Longitude",
              required: true,
              schema: { type: "number", example: -75.6972 },
            },
            {
              name: "dataset",
              in: "query",
              description: "Dataset to search",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "federalridings-2024.geojson",
                  "quebecridings-2025.geojson",
                  "ontarioridings-2022.geojson",
                ],
                default: "federalridings-2024.geojson",
              },
            },
          ],
          responses: {
            "200": {
              description: "Boundaries lookup successful",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      riding: { type: "string" },
                      properties: { type: "object" },
                      source: { type: "string" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/boundaries/all": {
        get: {
          summary: "Get All Boundaries",
          description: "Get all boundaries from the database with pagination",
          tags: ["Boundaries"],
          parameters: [
            {
              name: "dataset",
              in: "query",
              description: "Dataset to retrieve",
              required: false,
              schema: {
                type: "string",
                enum: [
                  "federalridings-2024.geojson",
                  "quebecridings-2025.geojson",
                  "ontarioridings-2022.geojson",
                ],
                default: "federalridings-2024.geojson",
              },
            },
            {
              name: "limit",
              in: "query",
              description: "Number of results to return",
              required: false,
              schema: {
                type: "number",
                default: 100,
                minimum: 1,
                maximum: 1000,
              },
            },
            {
              name: "offset",
              in: "query",
              description: "Number of results to skip",
              required: false,
              schema: { type: "number", default: 0, minimum: 0 },
            },
          ],
          responses: {
            "200": {
              description: "Boundaries retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      features: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string" },
                            properties: { type: "object" },
                            geometry: { type: "object" },
                          },
                        },
                      },
                      total: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/boundaries/config": {
        get: {
          summary: "Get Boundaries Configuration",
          description:
            "Get configuration information for boundaries processing",
          tags: ["Boundaries"],
          responses: {
            "200": {
              description: "Boundaries configuration retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      useRtreeIndex: { type: "boolean" },
                      batchInsertSize: { type: "number" },
                      datasets: {
                        type: "array",
                        items: { type: "string" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/geocoding/batch/status": {
        get: {
          summary: "Get Geocoding Batch Status",
          description:
            "Get status and configuration of batch geocoding functionality",
          tags: ["Geocoding"],
          responses: {
            "200": {
              description: "Geocoding batch status retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      enabled: { type: "boolean" },
                      maxBatchSize: { type: "number" },
                      timeout: { type: "number" },
                      retryAttempts: { type: "number" },
                      fallbackToIndividual: { type: "boolean" },
                      hasGoogleApiKey: { type: "boolean" },
                      timestamp: { type: "number" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/api/cache/warm": {
        post: {
          summary: "Trigger Cache Warming",
          description: "Manually trigger cache warming for specified locations",
          tags: ["Cache Management"],
          requestBody: {
            required: false,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    locations: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          lat: { type: "number" },
                          lon: { type: "number" },
                          postal: { type: "string" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Cache warming initiated",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      message: { type: "string" },
                      locations: { type: "number" },
                      timestamp: { type: "number" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/webhooks": {
        get: {
          summary: "List Webhooks",
          description: "Get list of all configured webhooks",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhooks list retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      webhooks: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            url: { type: "string" },
                            events: {
                              type: "array",
                              items: { type: "string" },
                            },
                            secret: { type: "string", nullable: true },
                            createdAt: { type: "number" },
                            lastDelivery: { type: "number", nullable: true },
                            failureCount: { type: "number" },
                            maxFailures: { type: "number" },
                            active: { type: "boolean" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
        post: {
          summary: "Create Webhook",
          description: "Create a new webhook configuration",
          tags: ["Webhook Management"],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    url: { type: "string", format: "uri" },
                    events: {
                      type: "array",
                      items: { type: "string" },
                      example: ["batch.completed", "batch.failed"],
                    },
                    secret: {
                      type: "string",
                      description: "Optional webhook secret",
                    },
                  },
                  required: ["url", "events"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Webhook created successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      webhookId: { type: "string" },
                      message: { type: "string" },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/webhooks/events": {
        get: {
          summary: "Get Webhook Events",
          description: "Get webhook events with optional filtering",
          tags: ["Webhook Management"],
          parameters: [
            {
              name: "status",
              in: "query",
              description: "Filter by event status",
              required: false,
              schema: {
                type: "string",
                enum: ["pending", "delivered", "failed"],
              },
            },
            {
              name: "webhookId",
              in: "query",
              description: "Filter by webhook ID",
              required: false,
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "Webhook events retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      events: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            webhookId: { type: "string" },
                            eventType: { type: "string" },
                            status: { type: "string" },
                            payload: { type: "object" },
                            createdAt: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/api/webhooks/deliveries": {
        get: {
          summary: "Get Webhook Deliveries",
          description: "Get webhook delivery attempts with optional filtering",
          tags: ["Webhook Management"],
          parameters: [
            {
              name: "webhookId",
              in: "query",
              description: "Filter by webhook ID",
              required: false,
              schema: { type: "string" },
            },
            {
              name: "status",
              in: "query",
              description: "Filter by delivery status",
              required: false,
              schema: {
                type: "string",
                enum: ["pending", "success", "failed"],
              },
            },
          ],
          responses: {
            "200": {
              description: "Webhook deliveries retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      deliveries: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            webhookId: { type: "string" },
                            eventId: { type: "string" },
                            status: { type: "string" },
                            responseCode: { type: "number", nullable: true },
                            responseBody: { type: "string", nullable: true },
                            attemptCount: { type: "number" },
                            createdAt: { type: "number" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
          security: [{ basicAuth: [] }],
        },
      },
      "/health": {
        get: {
          summary: "Health Check",
          description:
            "Get comprehensive health status including metrics, circuit breakers, and cache warming status",
          tags: ["System"],
          responses: {
            "200": {
              description: "Health status retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: {
                        type: "string",
                        enum: ["healthy", "unhealthy"],
                      },
                      timestamp: { type: "number" },
                      metrics: { type: "object" },
                      circuitBreakers: { type: "object" },
                      cacheWarming: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/metrics": {
        get: {
          summary: "Get Performance Metrics",
          description: "Get detailed performance metrics and statistics",
          tags: ["System"],
          responses: {
            "200": {
              description: "Metrics retrieved successfully",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      requests: {
                        type: "object",
                        properties: {
                          total: { type: "number" },
                          errors: { type: "number" },
                          errorRate: { type: "number" },
                        },
                      },
                      geocoding: { type: "object" },
                      r2: { type: "object" },
                      lookup: { type: "object" },
                      batch: { type: "object" },
                      webhooks: { type: "object" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/cache-warming": {
        get: {
          summary: "Get Cache Warming Status",
          description: "Get current cache warming status and configuration",
          tags: ["Cache Management"],
          responses: {
            "200": {
              description: "Cache warming status retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      isRunning: { type: "boolean" },
                      lastWarmed: { type: "number" },
                      currentBatch: { type: "number" },
                      totalBatches: { type: "number" },
                      successCount: { type: "number" },
                      failureCount: { type: "number" },
                      nextWarmingTime: { type: "number" },
                      config: {
                        type: "object",
                        properties: {
                          enabled: { type: "boolean" },
                          interval: { type: "number" },
                          batchSize: { type: "number" },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/webhooks": {
        get: {
          summary: "List Webhooks (Legacy)",
          description:
            "Legacy endpoint for listing webhooks - use /api/webhooks instead",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhooks list retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      webhooks: {
                        type: "array",
                        items: { type: "object" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/webhooks/events": {
        get: {
          summary: "Get Webhook Events (Legacy)",
          description:
            "Legacy endpoint for webhook events - use /api/webhooks/events instead",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhook events retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      events: { type: "array" },
                    },
                  },
                },
              },
            },
          },
        },
      },
      "/webhooks/deliveries": {
        get: {
          summary: "Get Webhook Deliveries (Legacy)",
          description:
            "Legacy endpoint for webhook deliveries - use /api/webhooks/deliveries instead",
          tags: ["Webhook Management"],
          responses: {
            "200": {
              description: "Webhook deliveries retrieved",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      deliveries: { type: "array" },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    securitySchemes: {
      basicAuth: {
        type: "http",
        scheme: "basic",
      },
      apiKey: {
        type: "apiKey",
        in: "header",
        name: "X-Google-API-Key",
        description: "Google Maps API key for BYOK authentication",
      },
    },
    tags: [
      {
        name: "Federal Ridings",
        description: "Operations for federal riding lookups",
      },
      {
        name: "Combined Lookup",
        description: "Federal plus Ontario or Quebec provincial riding in one request",
      },
      {
        name: "Quebec Ridings",
        description: "Operations for Quebec provincial riding lookups",
      },
      {
        name: "Ontario Ridings",
        description: "Operations for Ontario provincial riding lookups",
      },
      {
        name: "Batch Processing",
        description: "Batch processing operations",
      },
      {
        name: "Queue Operations",
        description: "Queue-based batch processing operations",
      },
      {
        name: "Database Operations",
        description: "Spatial database management and operations",
      },
      {
        name: "Boundaries",
        description: "Boundary data access and configuration",
      },
      {
        name: "Geocoding",
        description: "Geocoding service management and status",
      },
      {
        name: "Cache Management",
        description: "Cache warming and management operations",
      },
      {
        name: "Webhook Management",
        description: "Webhook configuration and monitoring",
      },
      {
        name: "System",
        description: "System health and monitoring endpoints",
      },
    ],
  };
}
