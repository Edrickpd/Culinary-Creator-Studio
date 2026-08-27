# 🚀 Guía Maestra de Despliegue y Configuración: Culinary Creator Studio

Esta guía detalla paso a paso todo lo necesario para sincronizar el repositorio en **GitHub**, desplegar en **Vercel** y mantener conectados **Supabase** y **Stripe** de forma 100% segura y funcional en producción beta.

---

## 📁 1. Archivos que se deben subir a GitHub

Sube **todos** los archivos de la estructura del proyecto excepto los protegidos por `.gitignore`. 

### ✅ Lista de Archivos y Carpetas a Incluir en el Commit:
* `src/` o carpetas de frontend:
  * `App.tsx`
  * `AppContext.tsx`
  * `index.tsx`
  * `index.html`
  * `types.ts`
  * `constants.tsx`
  * `locales.ts`
  * `supabaseClient.ts`
  * `manifest.json`
  * `metadata.json`
  * `components/` (todos los componentes: `BetaAlertModal.tsx`, `Layout.tsx`, `AuthModal.tsx`, etc.)
  * `pages/` (todas las pantallas: `Dashboard.tsx`, `CreateDish.tsx`, `PairingAnalysis.tsx`, `FoodCost.tsx`, `PriceTracker.tsx`, `Settings.tsx`, etc.)
  * `services/` (`geminiService.ts`, etc.)
* Backend y Serverless:
  * `server.ts` (servidor Express para entorno local/contenedor)
  * `api/index.ts` (manejador Serverless Function nativo para Vercel)
* Configuración de Build y Base de Datos:
  * `package.json`
  * `tsconfig.json`
  * `vite.config.ts`
  * `vercel.json` (rutas `/api/*` y fallback SPA)
  * `database.sql` (esquema maestro SQL para Supabase)
  * `.env.example` (plantilla de variables sin secretos)
  * `.gitignore`
  * `INSTRUCCIONES_DEPLOY_VERCEL.md` (este archivo)

### ⛔ Archivos que NUNCA deben subirse (Protegidos por `.gitignore`):
* ❌ `.env` o `.env.local`
* ❌ `node_modules/`
* ❌ `dist/` o `.vercel/`

---

## 🗄️ 2. Configuración en Supabase

### A. Ejecutar el Esquema SQL
1. Entra en tu panel de [Supabase Dashboard](https://supabase.com/dashboard).
2. Ve a **SQL Editor** en el menú izquierdo.
3. Copia todo el contenido del archivo `database.sql` de este proyecto, pégalo en el editor y haz clic en **Run**.
   - *Este script es 100% idempotente (se puede ejecutar varias veces sin borrar datos).*
   - *Crea automáticamente las tablas `profiles`, `projects`, `recipes`, `pairings`, `food_costs`, `shared_items`, `social_posts`, `promo_codes`, `promo_redemptions`, la función atómica `redeem_promo_code` y las políticas de seguridad RLS.*

### B. Configurar URLs de Redirección de Autenticación
1. En Supabase, ve a **Authentication > URL Configuration**.
2. Configura:
   - **Site URL**: `https://culinary-creator-studio.vercel.app`
   - **Redirect URLs**: Añade `https://culinary-creator-studio.vercel.app/**` y `http://localhost:3000/**`.

### C. Verificar Claves de API
1. En **Project Settings > API**:
   - Copia la **Project URL** (`https://erxcltywvfmmcxafansr.supabase.co`).
   - Copia la clave **`anon` `public`**.
   - Copia la clave **`service_role` `secret`** (necesaria para el Webhook de Stripe en Vercel).

---

## 💳 3. Configuración en Stripe

### A. Activar el Portal de Clientes (Customer Portal)
1. En tu [Stripe Dashboard](https://dashboard.stripe.com/), ve a **Settings (Configuración) > Billing > Customer portal (Portal del cliente)**.
2. Haz clic en **Activate (Activar)** o guarda la configuración.
3. Asegúrate de habilitar:
   - Permitir a los clientes cancelar suscripciones.
   - Permitir cambiar o actualizar métodos de pago.
   - Permitir descargar facturas en PDF.

### B. Configurar el Webhook de Stripe
1. En Stripe Dashboard, ve a **Developers > Webhooks**.
2. Haz clic en **Add endpoint (Añadir extremo)**.
3. **Endpoint URL**:
   ```
   https://culinary-creator-studio.vercel.app/api/stripe/webhook
   ```
4. **Eventos a escuchar**:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
5. Haz clic en **Add endpoint**.
6. En la ficha del webhook creado, haz clic en **Reveal (Revelar)** bajo *Signing secret* y copia el código `whsec_...`.

---

## ☁️ 4. Configuración en Vercel

En tu proyecto en [Vercel](https://vercel.com/):

### A. Build & Output Settings
- **Framework Preset**: `Vite`
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### B. Variables de Entorno en Vercel (Settings > Environment Variables)
Añade las siguientes variables para todos los entornos (*Production, Preview, Development*):

| Variable | Valor / Descripción |
| :--- | :--- |
| `VITE_SUPABASE_URL` | URL de tu proyecto Supabase (`https://xxxx.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | Clave pública `anon` de Supabase |
| `SUPABASE_URL` | Misma URL de Supabase |
| `SUPABASE_ANON_KEY` | Misma clave `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | Clave secreta `service_role` de Supabase |
| `STRIPE_SECRET_KEY` | Clave secreta de Stripe (`sk_live_...` o `sk_test_...`) |
| `STRIPE_WEBHOOK_SECRET` | Secreto del webhook creado en Stripe (`whsec_...`) |
| `GEMINI_API_KEY` | Tu clave de API de Google Gemini |

---

## 🎟️ 5. Gestión de Códigos Promocionales y Beta Testers

* **Para regalar suscripciones a chefs o evaluadores sin tarjeta**:
  1. Ve a Supabase > **Table Editor** > tabla `promo_codes`.
  2. Puedes usar los códigos precargados (`BETAPLATINUM3M`, `CHEFPRIME`, `CULINARYBETA`) o insertar nuevos registros.
  3. Los usuarios introducen el código en la pestaña **Suscripción** de la app o al registrarse.
  4. La base de datos actualiza su nivel (`prime` o `platinum_prime`) y fija la fecha de expiración automáticamente.
