require("dotenv").config();
const express = require("express");
const axios = require("axios");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const OPENUV_API_KEY = process.env.OPENUV_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const shareStore = new Map();

function validateCoords(lat, lng) {
  const latNum = Number(lat);
  const lngNum = Number(lng);
  if (!Number.isFinite(latNum) || !Number.isFinite(lngNum)) return null;
  if (latNum < -90 || latNum > 90 || lngNum < -180 || lngNum > 180) return null;
  return { lat: latNum, lng: lngNum };
}

function mapGeoName(item) {
  const admin = item.admin1 || item.state || item.region || "";
  const country = item.country || "";
  return [item.name, admin, country].filter(Boolean).join(", ");
}

async function resolveTimezone(lat, lng) {
  const response = await axios.get("https://api.open-meteo.com/v1/forecast", {
    params: {
      latitude: lat,
      longitude: lng,
      current: "temperature_2m",
      timezone: "auto",
    },
    timeout: 12000,
  });

  return {
    timezone: response.data?.timezone || null,
    timezoneAbbr: response.data?.timezone_abbreviation || null,
    utcOffsetSeconds: Number(response.data?.utc_offset_seconds || 0),
  };
}

function fallbackChatReply(message, context) {
  const prompt = String(message || "").toLowerCase();
  const uvObj = typeof context === "string" ? JSON.parse(context) : context;
  const uv = Number(uvObj?.uv) || Number(context?.uv);
  const uvText = Number.isFinite(uv) ? ` Current UV is ${uv.toFixed(1)}.` : "";

  // Dedicated fallback for the Travel Detail's 3-bullet prompt if Gemini rate-limits
  if (prompt.includes("travelling to") || prompt.includes("bullet 1")) {
    const safeTime = uv >= 6 ? "before 10 AM or after 4 PM" : (uv >= 3 ? "before 11 AM or after 3 PM" : "anytime with basic precautions");
    const clothing = uv >= 6 ? "a wide-brimmed hat, UV-blocking sunglasses, and UPF-rated long sleeves" : "sunglasses and comfortable breathable clothing";
    const advice = uv >= 8 ? `Strictly use SPF 50+ and reapply every 60 mins (UV is Very High at ${uv.toFixed(1)}).` : (uv >= 6 ? `Apply SPF 30+ and reapply every 90 mins (UV is High at ${uv.toFixed(1)}).` : `Basic SPF 30 is sufficient for today's UV of ${uv.toFixed(1)}.`);
    
    return `*   **When to go out:** Lowest risk times are ${safeTime} today.\n*   **What to wear:** Wear ${clothing} depending on the real-time index.\n*   **Sun Safety:** ${advice}`;
  }

  if (prompt.includes("uv index") || prompt.includes("uv scale") || prompt.includes("explain uv")) {
    return "UV scale: 0-2 Low, 3-5 Moderate, 6-7 High, 8-10 Very High, 11+ Extreme. Higher UV means faster skin damage, so protection should increase with each level." + uvText;
  }

  if (prompt.includes("best time") || prompt.includes("safe time") || prompt.includes("outside now")) {
    if (Number.isFinite(uv)) {
      if (uv >= 8) {
        return `Best to avoid direct sun right now because UV is very high (${uv.toFixed(1)}). Prefer early morning or late afternoon.`;
      }
      if (uv >= 6) {
        return `UV is high (${uv.toFixed(1)}). Limit midday exposure and prefer before 10 AM or after 4 PM.`;
      }
      return `Current UV is ${uv.toFixed(1)}, so short outdoor activity is usually okay with sunscreen.`;
    }
    return "Safest outdoor windows are usually early morning and late afternoon, while midday sun is strongest.";
  }

  if (prompt.includes("cloud") || prompt.includes("shade")) {
    return "Clouds reduce some sunlight but UV can still pass through, so you can still burn on cloudy days. Shade helps, but sunscreen is still recommended." + uvText;
  }

  if (prompt.includes("spf") || prompt.includes("sunscreen")) {
    if (Number.isFinite(uv) && uv >= 8) {
      return `Use SPF 50+ right now because UV is ${uv.toFixed(1)}. Reapply every 60 minutes outdoors.`;
    }
    if (Number.isFinite(uv) && uv >= 6) {
      return `Use SPF 30-50 because UV is ${uv.toFixed(1)}. Reapply every 90-120 minutes.`;
    }
    return "General SPF guidance: SPF 30 for daily use, SPF 50+ for strong sun, beach, or long outdoor activities." + uvText;
  }

  if (prompt.includes("vitamin d")) {
    return "For vitamin D, short exposure on arms/legs is usually enough. Avoid sunburn and prefer early morning or late afternoon when UV is lower.";
  }

  if (prompt.includes("safe") || prompt.includes("outside")) {
    return "Outdoor safety depends on current UV. As a rule, when UV is 3 or above, wear sunscreen, hat, and sunglasses." + uvText;
  }

  if (Number.isFinite(uv)) {
    if (uv >= 8) {
      return `UV is currently very high (${uv.toFixed(1)}). Use SPF 50+, avoid direct sun during peak hours, and reapply sunscreen every 60 minutes.`;
    }
    if (uv >= 6) {
      return `UV is high (${uv.toFixed(1)}). Use at least SPF 30-50, seek shade at midday, and reapply every 90 minutes.`;
    }
    if (uv >= 3) {
      return `UV is moderate (${uv.toFixed(1)}). Sunscreen is recommended, especially if you are outdoors for more than 20-30 minutes.`;
    }
    return `UV is low (${uv.toFixed(1)}). Risk is lower, but sunscreen is still helpful for prolonged outdoor exposure.`;
  }

  return "I can help with UV safety, sunscreen, best outdoor timing, cloud UV effects, and skin protection. Ask about SPF, UV scale, or safest times to go outside.";
}

app.get("/api/uv", async (req, res) => {
  const coords = validateCoords(req.query.lat, req.query.lng);
  if (!coords) {
    return res.status(400).json({ error: "Invalid latitude/longitude" });
  }

  try {
    if (!OPENUV_API_KEY) {
      throw new Error("OpenUV key missing");
    }

    const response = await axios.get(
      "https://api.openuv.io/api/v1/uv",
      {
        params: { lat: coords.lat, lng: coords.lng },
        headers: { "x-access-token": OPENUV_API_KEY },
        timeout: 12000,
      }
    );

    res.json(response.data);
  } catch (error) {
    // Fallback to Open-Meteo so dashboard still works even if OpenUV fails or hits limits.
    try {
      const fallback = await axios.get("https://api.open-meteo.com/v1/forecast", {
        params: {
          latitude: coords.lat,
          longitude: coords.lng,
          current: "uv_index",
          timezone: "UTC",
        },
        timeout: 12000,
      });

      const uv = Number(fallback.data?.current?.uv_index ?? 0);
      const uvTime = fallback.data?.current?.time || new Date().toISOString();

      return res.json({
        result: {
          uv,
          uv_time: uvTime,
          source: "open-meteo-fallback",
        },
      });
    } catch (fallbackErr) {
      // Robust Mock Fallback: if both APIs fail (e.g. rate limits), generate a realistic UV based on time
      try {
        const utcNow = new Date();
        const offsetHours = Math.round(coords.lng / 15);
        const localHour = (utcNow.getUTCHours() + offsetHours + 24) % 24;
        
        // Bell curve style UV: peak at 13:00 (1 PM)
        let simulatedUv = 0;
        if (localHour >= 7 && localHour <= 19) {
          const distFromPeak = Math.abs(localHour - 13);
          simulatedUv = Math.max(0, 10 - (distFromPeak * 1.5));
        }
        
        return res.json({
          result: {
            uv: simulatedUv,
            uv_max: simulatedUv + 1,
            uv_time: new Date().toISOString(),
            source: "mock-fallback"
          }
        });
      } catch (mockErr) {
        const detail = error?.response?.data || fallbackErr?.response?.data || null;
        return res.status(500).json({
          error: "Failed to fetch UV data",
          detail,
        });
      }
    }
  }
});

app.get("/api/uv-detail", async (req, res) => {
  const coords = validateCoords(req.query.lat, req.query.lng);
  if (!coords) {
    return res.status(400).json({ error: "Invalid latitude/longitude" });
  }

  try {
    if (!OPENUV_API_KEY) {
      throw new Error("OpenUV key missing");
    }

    const response = await axios.get(
      "https://api.openuv.io/api/v1/uv",
      {
        params: { lat: coords.lat, lng: coords.lng },
        headers: { "x-access-token": OPENUV_API_KEY },
        timeout: 12000,
      }
    );

    // Provide the full payload, which includes sun_info
    res.json(response.data);
  } catch (error) {
    console.warn("OpenUV limit reached for detailed fetch. Falling back to Open-Meteo current UV");
    
    // Fallback: Fetch real-time current UV from Open-Meteo!
    let realTimeUvIndex = 0;
    try {
      const meteo = await axios.get("https://api.open-meteo.com/v1/forecast", {
        params: {
          latitude: coords.lat,
          longitude: coords.lng,
          current: "uv_index",
          timezone: "UTC"
        },
        timeout: 5000
      });
      realTimeUvIndex = meteo.data?.current?.uv_index || 0;
    } catch (meteoErr) {
      console.error("Open-Meteo fallback failed as well", meteoErr.message);
    }
    
    const utcNow = new Date();
    const baseTime = utcNow.getTime();
    
    return res.json({
      result: {
        uv: realTimeUvIndex,
        uv_max: realTimeUvIndex + 1,
        uv_max_time: new Date(baseTime).toISOString(),
        ozone: 300,
        safe_exposure_time: {
          st1: 10, st2: 15, st3: 20, st4: 30, st5: 45, st6: 60
        },
        sun_info: {
          sun_times: {
            solarNoon: new Date(baseTime).toISOString(),
            nadir: new Date(baseTime + 43200000).toISOString(),
            sunrise: new Date(baseTime - 21600000).toISOString(),
            sunset: new Date(baseTime + 21600000).toISOString(),
            sunriseEnd: new Date(baseTime - 19800000).toISOString(),
            sunsetStart: new Date(baseTime + 19800000).toISOString(),
            dawn: new Date(baseTime - 23400000).toISOString(),
            dusk: new Date(baseTime + 23400000).toISOString(),
            nauticalDawn: new Date(baseTime - 25200000).toISOString(),
            nauticalDusk: new Date(baseTime + 25200000).toISOString(),
            nightEnd: new Date(baseTime - 27000000).toISOString(),
            night: new Date(baseTime + 27000000).toISOString(),
            goldenHourEnd: new Date(baseTime - 18000000).toISOString(),
            goldenHour: new Date(baseTime + 18000000).toISOString()
          },
          sun_position: {
            azimuth: -2.5,
            altitude: 0.8
          }
        }
      }
    });
  }
});

app.get("/api/forecast", async (req, res) => {
  const coords = validateCoords(req.query.lat, req.query.lng);
  if (!coords) {
    return res.status(400).json({ error: "Invalid latitude/longitude" });
  }

  try {
    const response = await axios.get("https://api.open-meteo.com/v1/forecast", {
      params: {
        latitude: coords.lat,
        longitude: coords.lng,
        hourly: "uv_index",
        forecast_days: 2,
        timezone: "UTC",
      },
      timeout: 12000,
    });

    const hourly = response.data?.hourly;
    const times = hourly?.time || [];
    const uvIndexes = hourly?.uv_index || [];

    const result = times.map((t, i) => ({
      uv_time: t,
      uv: Number(uvIndexes[i] ?? 0),
    }));

    res.json({ result });
  } catch (error) {
    // Robust Mock Fallback for Forecast
    try {
      const utcNow = new Date();
      const offsetHours = Math.round(coords.lng / 15);
      
      const result = [];
      for (let i = 0; i < 48; i++) {
        const futureTime = new Date(utcNow.getTime() + i * 3600000);
        const localHour = (futureTime.getUTCHours() + offsetHours + 24) % 24;
        
        let simulatedUv = 0;
        if (localHour >= 7 && localHour <= 19) {
          const distFromPeak = Math.abs(localHour - 13);
          simulatedUv = Math.max(0, 10 - (distFromPeak * 1.5));
        }
        
        result.push({
          uv_time: futureTime.toISOString(),
          uv: simulatedUv
        });
      }
      return res.json({ result });
    } catch (mockErr) {
      res.status(500).json({
        error: "Failed to fetch forecast data",
        detail: error?.response?.data || null,
      });
    }
  }
});

app.get("/api/geocode", async (req, res) => {
  const city = String(req.query.city || "").trim();
  if (!city) return res.status(400).json({ error: "City is required" });

  try {
    const response = await axios.get("https://geocoding-api.open-meteo.com/v1/search", {
      params: {
        name: city,
        count: 8,
        language: "en",
        format: "json",
      },
      timeout: 12000,
    });

    const results = (response.data?.results || []).map((item) => ({
      name: mapGeoName(item),
      lat: item.latitude,
      lng: item.longitude,
      country: item.country,
      state: item.admin1 || null,
      city: item.name,
      timezone: item.timezone || null,
    }));

    res.json(results);
  } catch (error) {
    res.status(500).json({
      error: "Failed to geocode city",
      detail: error?.response?.data || null,
    });
  }
});

app.get("/api/reverse-geocode", async (req, res) => {
  const coords = validateCoords(req.query.lat, req.query.lng);
  if (!coords) {
    return res.status(400).json({ error: "Invalid latitude/longitude" });
  }

  try {
    const response = await axios.get("https://nominatim.openstreetmap.org/reverse", {
      params: {
        lat: coords.lat,
        lon: coords.lng,
        format: "jsonv2",
        zoom: 12,
        addressdetails: 1,
      },
      headers: {
        "User-Agent": "HelioSense/1.0",
      },
      timeout: 12000,
    });

    const hit = response.data || null;
    const addr = hit?.address || {};

    let tz = {
      timezone: null,
      timezoneAbbr: null,
      utcOffsetSeconds: 0,
    };

    try {
      tz = await resolveTimezone(coords.lat, coords.lng);
    } catch (e) {
      // keep best-effort values
    }

    const city =
      addr.city ||
      addr.town ||
      addr.village ||
      addr.municipality ||
      addr.county ||
      null;
    const state = addr.state || addr.region || null;
    const country = addr.country || null;
    const fallbackName = `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`;
    const name = [city, state, country].filter(Boolean).join(", ") || hit?.display_name || fallbackName;

    res.json({
      name,
      city,
      state,
      country,
      lat: coords.lat,
      lng: coords.lng,
      timezone: tz.timezone,
      timezoneAbbr: tz.timezoneAbbr,
      utcOffsetSeconds: tz.utcOffsetSeconds,
    });
  } catch (error) {
    try {
      const tz = await resolveTimezone(coords.lat, coords.lng);
      return res.json({
        name: `${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`,
        city: null,
        state: null,
        country: null,
        lat: coords.lat,
        lng: coords.lng,
        timezone: tz.timezone,
        timezoneAbbr: tz.timezoneAbbr,
        utcOffsetSeconds: tz.utcOffsetSeconds,
      });
    } catch (tzErr) {
      res.status(500).json({
        error: "Failed to reverse geocode",
        detail: error?.response?.data || tzErr?.response?.data || null,
      });
    }
  }
});

app.get("/api/timezone", async (req, res) => {
  const coords = validateCoords(req.query.lat, req.query.lng);
  if (!coords) {
    return res.status(400).json({ error: "Invalid latitude/longitude" });
  }

  try {
    const tz = await resolveTimezone(coords.lat, coords.lng);
    res.json(tz);
  } catch (error) {
    res.status(500).json({
      error: "Failed to resolve timezone",
      detail: error?.response?.data || null,
    });
  }
});

app.post("/api/share", (req, res) => {
  const reportData = req.body?.reportData;
  if (!reportData) return res.status(400).json({ error: "Missing reportData" });

  const id = crypto.randomBytes(6).toString("hex");
  shareStore.set(id, {
    reportData,
    createdAt: Date.now(),
  });

  res.json({ url: `/share?id=${id}` });
});

app.get("/api/share/:id", (req, res) => {
  const row = shareStore.get(req.params.id);
  if (!row) return res.status(404).json({ error: "Share not found" });
  res.json(row.reportData);
});

app.post("/api/chat", async (req, res) => {
  const message = String(req.body?.message || "").trim();
  const context = req.body?.context || null;
  const language = String(req.body?.language || "English").trim();
  if (!message) return res.status(400).json({ error: "Message is required" });

  if (!GEMINI_API_KEY) {
    return res.json({ reply: fallbackChatReply(message, context) });
  }

  try {
    const contextText = context
      ? `Current UV context: ${JSON.stringify(context)}`
      : "No UV context available.";

    const langInstruction = language !== "English"
      ? `CRITICAL COMMAND: You must respond ENTIRELY, STRICTLY, AND ONLY in ${language}. Do not include ANY English introductions, words, or phrases.`
      : "";

    const prompt = [
      "You are HelioSense AI, a sun safety assistant.",
      "Give concise, practical and safe advice.",
      langInstruction,
      contextText,
      `User: ${message}`,
    ].filter(Boolean).join("\n");

    const geminiRes = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.5,
          maxOutputTokens: 400,
        },
      },
      { timeout: 20000 }
    );

    const reply =
      geminiRes.data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      fallbackChatReply(message, context);

    res.json({ reply });
  } catch (error) {
    console.error("Gemini API Error:", error?.response?.data || error.message);
    res.json({ reply: fallbackChatReply(message, context) });
  }
});

// Friendly page routes so links like /dashboard work in local dev too.
app.get("/", (req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.get("/dashboard", (req, res) => res.sendFile(path.join(__dirname, "public", "dashboard.html")));
app.get("/forecast", (req, res) => res.sendFile(path.join(__dirname, "public", "forecast.html")));
app.get("/calculator", (req, res) => res.sendFile(path.join(__dirname, "public", "calculator.html")));
app.get("/locations", (req, res) => res.sendFile(path.join(__dirname, "public", "locations.html")));
app.get("/share", (req, res) => res.sendFile(path.join(__dirname, "public", "share.html")));
app.get("/chatbot", (req, res) => res.sendFile(path.join(__dirname, "public", "chatbot.html")));
app.get("/travel-detail", (req, res) => res.sendFile(path.join(__dirname, "public", "travel-detail.html")));

// Export for Vercel serverless
module.exports = app;

// Only start server locally (not on Vercel)
if (!process.env.VERCEL) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}