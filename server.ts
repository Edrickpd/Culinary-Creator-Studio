import express, { Request, Response } from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import Stripe from "stripe";
import { createClient } from "@supabase/supabase-js";

const app = express();
const PORT = 3000;

// Stripe Client
let stripeClient: Stripe | null = null;
function getStripe(): Stripe | null {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) return null;
  if (!stripeClient) {
    stripeClient = new Stripe(apiKey);
  }
  return stripeClient;
}

// Gemini Client
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
  if (!apiKey) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// Supabase Client
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || 'https://erxcltywvfmmcxafansr.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVyeGNsdHl3dmZtbWN4YWZhbnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njc0Mzc4MzEsImV4cCI6MjA4MzAxMzgzMX0.l-o2Lwk-D-JgY6jgI2XinfT3nqL6jZ03dZc5UJJ9Qc0';
const supabase = createClient(supabaseUrl, supabaseKey);

// Middleware
app.use(express.json({
  verify: (req: any, _res, buf) => {
    req.rawBody = buf;
  }
}));

// Health check
app.get("/api/health", (_req: Request, res: Response) => {
  res.json({
    status: "ok",
    environment: "fullstack-container",
    hasStripeKey: !!process.env.STRIPE_SECRET_KEY,
    hasWebhookSecret: !!process.env.STRIPE_WEBHOOK_SECRET,
    hasGeminiKey: !!(process.env.GEMINI_API_KEY || process.env.API_KEY),
    timestamp: new Date().toISOString()
  });
});

// --- STRIPE CHECKOUT ---
app.post("/api/stripe/create-checkout-session", async (req: Request, res: Response): Promise<void> => {
  try {
    const { plan, userId, userEmail, returnUrl } = req.body;
    const stripe = getStripe();

    if (!stripe) {
      res.status(503).json({
        error: "STRIPE_NOT_CONFIGURED",
        message: "Stripe Secret Key is not configured yet in environment settings.",
        requiresEnv: ["STRIPE_SECRET_KEY"]
      });
      return;
    }

    if (!plan || (plan !== 'prime' && plan !== 'platinum_prime')) {
      res.status(400).json({ error: "Invalid plan specified. Must be 'prime' or 'platinum_prime'." });
      return;
    }

    const origin = returnUrl ? returnUrl.split('#')[0] : `http://localhost:${PORT}`;
    const successUrl = `${origin}#/settings?tab=subscription&status=success&session_id={CHECKOUT_SESSION_ID}&plan=${plan}`;
    const cancelUrl = `${origin}#/settings?tab=subscription&status=cancelled`;

    const isPlatinumPrime = plan === 'platinum_prime';
    const planName = isPlatinumPrime ? 'Platinum Prime Plan' : 'Prime Plan';
    const unitAmount = isPlatinumPrime ? 2500 : 900; // 25.00€ or 9.00€

    const customPriceId = isPlatinumPrime 
      ? process.env.STRIPE_PRICE_ID_PLATINUM_PRIME 
      : process.env.STRIPE_PRICE_ID_PRIME;

    const lineItems: Stripe.Checkout.SessionCreateParams.LineItem[] = customPriceId
      ? [{ price: customPriceId, quantity: 1 }]
      : [{
          price_data: {
            currency: 'eur',
            product_data: {
              name: `Culinary Creator Studio - ${planName}`,
              description: isPlatinumPrime
                ? 'Unlimited recipes, molecular pairings, food costs & global price tracker.'
                : 'Up to 30 recipes, 30 food costs, 10 quick/deep pairings per month & full price tracker.'
            },
            unit_amount: unitAmount,
            recurring: { interval: 'month' }
          },
          quantity: 1
        }];

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: lineItems,
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: userId || undefined,
      metadata: {
        userId: userId || '',
        plan: plan,
        app: 'culinary-creator-studio'
      },
      subscription_data: {
        metadata: {
          userId: userId || '',
          plan: plan
        }
      }
    };

    if (userEmail) {
      sessionParams.customer_email = userEmail;
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    res.json({ url: session.url, sessionId: session.id });
  } catch (err: any) {
    console.error("Stripe checkout error:", err);
    res.status(500).json({ error: err.message || "Failed to create checkout session" });
  }
});

// --- STRIPE CUSTOMER PORTAL ---
app.post("/api/stripe/create-portal-session", async (req: Request, res: Response): Promise<void> => {
  try {
    const { customerId, returnUrl } = req.body;
    const stripe = getStripe();

    if (!stripe) {
      res.status(503).json({ error: "STRIPE_NOT_CONFIGURED" });
      return;
    }

    if (!customerId) {
      res.status(400).json({ error: "Customer ID is required." });
      return;
    }

    const origin = returnUrl ? returnUrl.split('#')[0] : `http://localhost:${PORT}`;
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${origin}#/settings?tab=subscription`
    });

    res.json({ url: portalSession.url });
  } catch (err: any) {
    console.error("Stripe portal error:", err);
    res.status(500).json({ error: err.message || "Failed to create portal session" });
  }
});

// --- STRIPE WEBHOOK ---
app.post("/api/stripe/webhook", async (req: Request, res: Response): Promise<void> => {
  const stripe = getStripe();
  if (!stripe) {
    res.status(503).json({ error: "Stripe not configured" });
    return;
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event: Stripe.Event;

  try {
    if (webhookSecret && sig && (req as any).rawBody) {
      event = stripe.webhooks.constructEvent((req as any).rawBody, sig, webhookSecret);
    } else {
      event = req.body;
    }
  } catch (err: any) {
    console.error("Webhook signature verification failed:", err.message);
    res.status(400).send(`Webhook Error: ${err.message}`);
    return;
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id || session.metadata?.userId;
        const plan = session.metadata?.plan || 'prime';
        const customerId = session.customer as string;

        console.log(`[Stripe Webhook] Checkout completed for user ${userId}, plan: ${plan}, customer: ${customerId}`);

        if (userId) {
          const renewalDate = new Date();
          renewalDate.setMonth(renewalDate.getMonth() + 1);

          await supabase
            .from('profiles')
            .update({
              tier: plan === 'platinum_prime' ? 'platinum_prime' : 'prime',
              subscription_status: 'active',
              stripe_customer_id: customerId,
              subscription_renewal: renewalDate.toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq('id', userId);
        }
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;
        const status = subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : subscription.status;
        
        const currentPeriodEnd = (subscription as any).current_period_end;
        const renewalDate = currentPeriodEnd ? new Date(currentPeriodEnd * 1000).toISOString() : undefined;

        console.log(`[Stripe Webhook] Subscription updated for customer ${customerId}, status: ${status}`);

        const updateData: any = {
          subscription_status: status,
          updated_at: new Date().toISOString()
        };
        if (renewalDate) {
          updateData.subscription_renewal = renewalDate;
        }

        await supabase
          .from('profiles')
          .update(updateData)
          .eq('stripe_customer_id', customerId);
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const customerId = subscription.customer as string;

        console.log(`[Stripe Webhook] Subscription deleted for customer ${customerId}`);

        await supabase
          .from('profiles')
          .update({
            tier: 'free',
            subscription_status: 'canceled',
            updated_at: new Date().toISOString()
          })
          .eq('stripe_customer_id', customerId);
        break;
      }
      default:
        console.log(`[Stripe Webhook] Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (err: any) {
    console.error("Error processing webhook:", err);
    res.status(500).json({ error: "Internal webhook handler error" });
  }
});

// --- GEMINI SERVER-SIDE PROXIES ---
app.post("/api/gemini/analyze-pairing", async (req: Request, res: Response): Promise<void> => {
  try {
    const { ingredients, language = 'English', isDeep = false } = req.body;
    const ai = getAI();

    if (!ai) {
      res.status(503).json({ error: "GEMINI_NOT_CONFIGURED" });
      return;
    }

    const prompt = `You are a world-class molecular gastronomy and flavor chemistry expert.
Analyze the culinary pairing compatibility for the following ingredients: ${ingredients.join(', ')}.
Target Language: ${language}
Depth Mode: ${isDeep ? 'Comprehensive Molecular Deep-Dive' : 'Fast Kitchen Snapshot'}

Return a valid JSON object matching this schema:
{
  "compatibilityScore": number (1-100),
  "flavorProfile": string[],
  "detailedExplanation": string,
  "suggestedDishes": [
    { "name": string, "difficulty": "BEGINNER" | "INTERMEDIATE" | "ADVANCED" }
  ],
  "physicochemicalInfo": string,
  "complementaryIngredients": string[],
  "tips": string[],
  "thingsToAvoid": string[],
  "historicalContext": string,
  "complexity": string,
  "intensity": string,
  "recommendedRatio": string
}`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text?.trim() || "{}";
    const data = JSON.parse(text);
    res.json(data);
  } catch (err: any) {
    console.error("Gemini pairing error:", err);
    res.status(500).json({ error: err.message || "Failed to analyze pairing" });
  }
});

app.post("/api/gemini/optimize", async (req: Request, res: Response): Promise<void> => {
  try {
    const { type, ingredients } = req.body;
    const ai = getAI();

    if (!ai) {
      res.status(503).json({ error: "GEMINI_NOT_CONFIGURED" });
      return;
    }

    const prompt = type === 'nutritional'
      ? `Review this recipe ingredient list for nutritional optimization: ${JSON.stringify(ingredients)}. Return a JSON array of 3 objects with title, current, recommendation, impact.`
      : `Review this recipe ingredient list for cost and economic optimization: ${JSON.stringify(ingredients)}. Return a JSON array of 3 objects with title, current, recommendation, impact.`;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text?.trim() || "[]";
    res.json(JSON.parse(text));
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to optimize ingredients" });
  }
});

app.post("/api/gemini/chat", async (req: Request, res: Response): Promise<void> => {
  try {
    const { message } = req.body;
    const ai = getAI();

    if (!ai) {
      res.status(503).json({ error: "GEMINI_NOT_CONFIGURED" });
      return;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [{ parts: [{ text: message }] }],
      config: {
        systemInstruction: "You are a world-class professional Michelin-starred chef and culinary mentor. Provide practical, accurate, highly knowledgeable culinary guidance and creative ideas. Be concise, inspiring, and direct."
      }
    });

    res.json({ text: response.text || "" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Chat failed" });
  }
});

// Start Server with Vite
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa"
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('{*all}', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
