# HelioSense

HelioSense is a full-stack UV and sun-safety web app that helps users check real-time UV risk, compare multiple locations, plan safer travel windows, and get practical AI guidance.

## Why This Project Is Useful 

- Real-time UV with resilient fallbacks: Uses OpenUV, then Open-Meteo, then safe mock fallback logic to keep the app working.
- Multi-page UV workflow: Dashboard, Forecast, Calculator, Locations, Travel Detail, AI Chat, and Share pages.
- Location intelligence: City geocoding, reverse geocoding, timezone resolution, and local-time rendering for travel details.
- Compare + Travel planning modes: Save destinations, compare UV levels, and inspect travel-focused UV/sun-time insights.
- AI guidance with graceful degradation: Gemini-powered chat when key exists, deterministic fallback advice when it does not.
- Privacy-friendly sharing: Generates share links without exposing API keys to the client.
- Vercel-ready routing: Includes server + static routes via vercel.json.

## Tech Stack

### Backend
- Node.js
- Express 5
- Axios
- CORS
- Dotenv

### Frontend
- Vanilla HTML, CSS, JavaScript
- Single shared client script: public/app.js

### External APIs
- OpenUV API (primary UV source)
- Open-Meteo API (forecast/timezone + UV fallback)
- Nominatim (reverse geocoding)
- Google Gemini API (chat assistant)


## Setup (Run Locally)

1. Clone and install dependencies

```bash
npm install
```

2. Create your env file

- Copy .env.example to .env
- Add your real API keys

```bash
# Windows PowerShell
Copy-Item .env.example .env
```

3. Start the app

```bash
npm run dev
```

or

```bash
npm start
```

4. Open in browser

- http://localhost:3000

## Environment Variables

Use the values in .env.example.

- OPENUV_API_KEY: Required for primary UV endpoints.
- GEMINI_API_KEY: Optional for AI chat; if missing, server fallback chat replies are used.
- PORT: Optional server port (defaults to 3000).

## Deployment

The app includes vercel.json and is ready for Vercel deployment.

Set these environment variables in your deployment platform:

- OPENUV_API_KEY
- GEMINI_API_KEY (optional)
- PORT (optional)

