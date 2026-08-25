import { defineConfig, loadEnv, Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { GoogleGenAI, Type, Modality } from '@google/genai';

function geminiServerPlugin(): Plugin {
  return {
    name: 'gemini-server-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/gemini')) {
          return next();
        }

        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || process.env.VITE_GEMINI_API_KEY;

        // Parse JSON body
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          try {
            res.setHeader('Content-Type', 'application/json');

            if (!apiKey) {
              res.statusCode = 503;
              res.end(JSON.stringify({ error: 'API_KEY is not defined in the server environment.' }));
              return;
            }

            const ai = new GoogleGenAI({ apiKey });
            const data = body ? JSON.parse(body) : {};

            if (req.url === '/api/gemini/analyze-pairing') {
              const { ingredients = [], language = 'English', isDeep = false } = data;
              let prompt = `Analyze the culinary pairing of: ${ingredients.join(", ")}.
The entire response must be in ${language}.
Return a JSON response with:
- compatibilityScore (number 0-100)
- flavorProfile (array of strings)
- detailedExplanation (around 100 words)`;

              if (isDeep) {
                prompt += `
- complexity (string: e.g. Low, Medium, High)
- intensity (string: e.g. Subtle, Balanced, Pungent)
- recommendedRatio (string: You MUST provide the exact numerical percentage recommended for EVERY ingredient provided. For example: "${ingredients[0]} 60% / ${ingredients[1]} 40%").
- sources (array of strings listing culinary or scientific references)
- physicochemicalInfo (Scientific explanation of the pairing)
- complementaryIngredients (Array of strings of other ingredients that complement this pairing)
- tips (Array of strings with culinary tips)
- thingsToAvoid (Array of strings of common mistakes or ingredients that clash)
- historicalContext (Historical or cultural relevance if it exists)`;
              }

              prompt += `
- suggestedDishes (array of objects with 'name' and 'difficulty')`;

              const properties: any = {
                compatibilityScore: { type: Type.NUMBER },
                flavorProfile: { type: Type.ARRAY, items: { type: Type.STRING } },
                detailedExplanation: { type: Type.STRING },
                suggestedDishes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      difficulty: { type: Type.STRING }
                    },
                    required: ["name", "difficulty"]
                  }
                }
              };

              const required = ["compatibilityScore", "flavorProfile", "detailedExplanation", "suggestedDishes"];
              if (isDeep) {
                properties.complexity = { type: Type.STRING };
                properties.intensity = { type: Type.STRING };
                properties.recommendedRatio = { type: Type.STRING };
                properties.sources = { type: Type.ARRAY, items: { type: Type.STRING } };
                properties.physicochemicalInfo = { type: Type.STRING };
                properties.complementaryIngredients = { type: Type.ARRAY, items: { type: Type.STRING } };
                properties.tips = { type: Type.ARRAY, items: { type: Type.STRING } };
                properties.thingsToAvoid = { type: Type.ARRAY, items: { type: Type.STRING } };
                properties.historicalContext = { type: Type.STRING };
                required.push("complexity", "intensity", "recommendedRatio", "sources", "physicochemicalInfo", "complementaryIngredients", "tips", "thingsToAvoid", "historicalContext");
              }

              const response = await ai.models.generateContent({
                model: "gemini-3.7-flash",
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.OBJECT,
                    properties,
                    required
                  }
                }
              });

              res.statusCode = 200;
              res.end(response.text || '{}');
              return;
            }

            if (req.url === '/api/gemini/chat') {
              const { message = '' } = data;
              const response = await ai.models.generateContent({
                model: "gemini-3.7-flash",
                contents: [{ parts: [{ text: message }] }],
                config: {
                  systemInstruction: "You are a world-class professional Michelin-starred chef and culinary mentor. Provide practical, accurate, highly knowledgeable culinary guidance and creative ideas. Be concise, inspiring, and direct."
                }
              });

              res.statusCode = 200;
              res.end(JSON.stringify({ text: response.text || '' }));
              return;
            }

            if (req.url === '/api/gemini/optimize') {
              const { type = 'economic', ingredients = [] } = data;
              const prompt = type === 'nutritional'
                ? `Review this recipe ingredient list for nutritional optimization:
${JSON.stringify(ingredients.map((i: any) => ({ name: i.name, qty: i.quantity, unit: i.unit })))}
Provide 3 suggestions to improve nutrition (higher protein, lower fat, or more fiber). Return a JSON array of objects with title, current, recommendation, impact.`
                : `Review this recipe ingredient list for cost optimization:
${JSON.stringify(ingredients.map((i: any) => ({ name: i.name, qty: i.quantity, unit: i.unit, price: i.unitPrice })))}
Provide 3 suggestions to reduce total cost (bulk buy, supplier switch, or ingredient swap). Return a JSON array of objects with title, current, recommendation, impact.`;

              const response = await ai.models.generateContent({
                model: "gemini-3.7-flash",
                contents: [{ parts: [{ text: prompt }] }],
                config: {
                  responseMimeType: "application/json",
                  responseSchema: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        title: { type: Type.STRING },
                        current: { type: Type.STRING },
                        recommendation: { type: Type.STRING },
                        impact: { type: Type.STRING }
                      },
                      required: ["title", "current", "recommendation", "impact"]
                    }
                  }
                }
              });

              res.statusCode = 200;
              res.end(response.text || '[]');
              return;
            }

            res.statusCode = 404;
            res.end(JSON.stringify({ error: 'Endpoint not found' }));
          } catch (err: any) {
            console.error('Gemini API Server Error:', err);
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message || 'Internal AI service error' }));
          }
        });
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const apiKey = env.GEMINI_API_KEY || env.API_KEY || env.VITE_GEMINI_API_KEY || process.env.GEMINI_API_KEY || process.env.API_KEY || '';

  return {
    plugins: [react(), geminiServerPlugin()],
    define: {
      'process.env.API_KEY': JSON.stringify(apiKey),
      'process.env.GEMINI_API_KEY': JSON.stringify(apiKey),
      'import.meta.env.VITE_GEMINI_API_KEY': JSON.stringify(apiKey)
    },
    build: {
      outDir: 'dist',
    },
    server: {
      port: 3000,
    }
  };
});
