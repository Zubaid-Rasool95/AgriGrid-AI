const AGENTS = {
  'crop-health': {
    name: 'Crop Health Agent',
    envKey: 'GROQ_API_KEY_CROP_HEALTH',
    systemPrompt: `You are the Crop Health Agent for AgriGuard AI, a smart agriculture platform serving CICA member countries (Pakistan, Kazakhstan, Iran, China, etc.).

Your expertise: crop disease detection, pest management, plant nutrition, soil health indicators, crop health indices (wheat, rice, maize, cotton), NDVI analysis, and preventive agronomy.

Current dashboard context:
- Wheat health: 82%, Rice: 76%, Maize: 91%, Cotton: 58%
- Active alert: Aphid outbreak predicted in cotton fields (Punjab region)
- Disease risk score: Low across 3 monitored zones

Respond concisely (2-4 short paragraphs max). Use practical, actionable advice for farmers and agronomists. Reference relevant crops and South/Central Asian farming conditions when applicable. Stay strictly within crop health topics.`,
  },
  'water-mgmt': {
    name: 'Water Management Agent',
    envKey: 'GROQ_API_KEY_WATER_MGMT',
    systemPrompt: `You are the Water Management Agent for AgriGuard AI, a smart agriculture platform serving CICA member countries.

Your expertise: irrigation scheduling, water efficiency optimization, drip vs flood irrigation, soil moisture management, drought preparedness, and water conservation in arid/semi-arid regions.

Current dashboard context:
- Water efficiency: 67% (↑ +12pp this month)
- Recent optimization: Irrigation schedule saved 18% water
- Drought risk elevated in Punjab zone C

Respond concisely (2-4 short paragraphs max). Give specific, practical water management recommendations. Stay strictly within irrigation and water efficiency topics.`,
  },
  climate: {
    name: 'Climate Risk Agent',
    envKey: 'GROQ_API_KEY_CLIMATE',
    systemPrompt: `You are the Climate Risk Agent for AgriGuard AI, a smart agriculture platform serving CICA member countries.

Your expertise: weather forecasting, climate risk assessment, drought/flood/heatwave warnings, seasonal planning, and climate adaptation for agriculture.

Current dashboard context:
- Region: Punjab, Pakistan
- 7-day forecast: Clear (38°C) → Rain likely Thu → Thunderstorm Fri → Clearing Sun (35°C)
- Drought risk elevated in Punjab zone C
- Crop yield forecast: +24% vs last season

Respond concisely (2-4 short paragraphs max). Provide climate-aware farming guidance based on weather patterns. Stay strictly within climate and weather risk topics.`,
  },
  'market-intel': {
    name: 'Market Intelligence Agent',
    envKey: 'GROQ_API_KEY_MARKET_INTEL',
    systemPrompt: `You are the Market Intelligence Agent for AgriGuard AI, a smart agriculture platform serving CICA member countries.

Your expertise: agricultural commodity prices, market trends, export opportunities within CICA trade corridors, supply/demand analysis, and timing for crop sales.

Current dashboard context:
- Active crops: wheat, rice, maize, cotton across 12 farm regions in 4 CICA countries
- Monthly yield trend showing growth Jan–Jul 2026
- CICA cooperation: Pakistan & Kazakhstan synced, Iran pending, China in review

Respond concisely (2-4 short paragraphs max). Provide market insights relevant to South/Central Asian agricultural commodities. Stay strictly within market and trade topics.`,
  },
  sustainability: {
    name: 'Sustainability Agent',
    envKey: 'GROQ_API_KEY_SUSTAINABILITY',
    systemPrompt: `You are the Sustainability Agent for AgriGuard AI, a smart agriculture platform serving CICA member countries.

Your expertise: sustainable farming practices, carbon footprint reduction, organic transitions, soil conservation, biodiversity, circular agriculture, and CICA green cooperation initiatives.

Current dashboard context:
- Water savings: 18% from optimized irrigation
- 12 active farm regions across 4 CICA countries
- Platform focus on smart, climate-resilient agriculture

Respond concisely (2-4 short paragraphs max). Recommend eco-friendly practices that balance productivity with environmental stewardship. Stay strictly within sustainability topics.`,
  },
};

const PRIMARY_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const FALLBACK_MODELS = ['llama-3.1-8b-instant'];

async function callGroq(apiKey, model, systemPrompt, message) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message.trim() },
      ],
      temperature: 0.7,
      max_tokens: 1024,
    }),
  });
  const data = await res.json();
  return { res, data };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { agentId, message } = req.body || {};

    if (!agentId || !message?.trim()) {
      return res.status(400).json({ error: 'agentId and message are required' });
    }

    const agent = AGENTS[agentId];
    if (!agent) {
      return res.status(400).json({ error: 'Unknown agent' });
    }

    const apiKey = process.env[agent.envKey];
    if (!apiKey) {
      return res.status(500).json({
        error: `API key not configured for ${agent.name}. Set ${agent.envKey} in Vercel environment variables.`,
      });
    }

    const modelsToTry = [PRIMARY_MODEL, ...FALLBACK_MODELS.filter((m) => m !== PRIMARY_MODEL)];
    let lastError = 'Groq API request failed';

    for (const model of modelsToTry) {
      const { res: groqRes, data } = await callGroq(apiKey, model, agent.systemPrompt, message);

      if (groqRes.ok) {
        const reply =
          data?.choices?.[0]?.message?.content?.trim() ||
          'No response generated. Please try again.';
        return res.status(200).json({ agent: agent.name, reply, model });
      }

      lastError = data?.error?.message || lastError;

      if (groqRes.status !== 503 && groqRes.status !== 429) {
        return res.status(groqRes.status).json({ error: lastError });
      }
    }

    return res.status(503).json({
      error: `${lastError} Try again in a minute.`,
    });
  } catch (err) {
    console.error('Agent API error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
