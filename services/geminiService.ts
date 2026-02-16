
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { CostIngredient, OptimizationSuggestion } from "../types";

// Standard decoding functions as per @google/genai guidelines
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

export class GeminiService {
  private _ai: GoogleGenAI | null = null;

  // Lazy getter to prevent crash if process.env.API_KEY is missing during boot
  private get ai(): GoogleGenAI {
    if (!this._ai) {
      const apiKey = process.env.API_KEY;
      if (!apiKey) {
        throw new Error("API_KEY is not defined in the environment.");
      }
      this._ai = new GoogleGenAI({ apiKey });
    }
    return this._ai;
  }

  async analyzePairing(ingredients: string[], options: { language?: string; isDeep?: boolean } = {}) {
    const { language = 'English', isDeep = false } = options;
    try {
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

      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
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

      return JSON.parse(response.text || "{}");
    } catch (error) {
      console.error("Pairing analysis error:", error);
      throw error;
    }
  }

  async getNutritionalOptimization(ingredients: CostIngredient[]): Promise<OptimizationSuggestion[]> {
    const prompt = `Review this recipe ingredient list for nutritional optimization:
    ${JSON.stringify(ingredients.map(i => ({ name: i.name, qty: i.quantity, unit: i.unit })))}
    Provide 3 suggestions to improve nutrition (higher protein, lower fat, or more fiber).
    Return a JSON array of objects with title, current, recommendation, impact.`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
      return JSON.parse(response.text || "[]");
    } catch (e) {
      return [];
    }
  }

  async getEconomicOptimization(ingredients: CostIngredient[]): Promise<OptimizationSuggestion[]> {
    const prompt = `Review this recipe ingredient list for cost optimization:
    ${JSON.stringify(ingredients.map(i => ({ name: i.name, qty: i.quantity, unit: i.unit, price: i.unitPrice })))}
    Provide 3 suggestions to reduce total cost (bulk buy, supplier switch, or ingredient swap).
    Return a JSON array of objects with title, current, recommendation, impact.`;

    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-flash-preview",
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
      return JSON.parse(response.text || "[]");
    } catch (e) {
      return [];
    }
  }

  async getCulinaryAdvice(message: string) {
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-3-pro-preview",
        contents: [{ parts: [{ text: message }] }],
        config: {
            systemInstruction: "You are a world-class professional chef assistant. Provide practical, accurate culinary advice. Be concise but helpful."
        }
      });
      return response.text;
    } catch (error) {
      console.error("Chat error:", error);
      return "I'm having trouble connecting to the kitchen right now. Please try again later.";
    }
  }

  async speak(text: string): Promise<AudioBuffer | null> {
    try {
      const response = await this.ai.models.generateContent({
        model: "gemini-2.5-flash-preview-tts",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: "Kore" }
            }
          }
        }
      });

      const base64Data = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (!base64Data) return null;

      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      
      const bytes = decode(base64Data);
      return await decodeAudioData(bytes, audioCtx, 24000, 1);
    } catch (error) {
      console.error("TTS error:", error);
      return null;
    }
  }
}

export const gemini = new GeminiService();
