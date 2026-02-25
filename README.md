# Sommeasy — Your Wine DNA Profile

A mobile-friendly web app that builds your Wine DNA profile based on the wines, regions, and grapes you already know you love — then helps you pick wines at restaurants.

## Quick Start (Local Development)

```bash
# 1. Install dependencies
npm install

# 2. Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Setup Checklist

### 1. Supabase Database Setup

Go to your Supabase dashboard → SQL Editor → New Query, then paste and run the contents of:

```
supabase/migrations/001_create_profiles.sql
```

This creates the `wine_profiles` table with Row Level Security policies.

### 2. Supabase Auth Setup

In your Supabase dashboard:

1. Go to **Authentication → Providers**
2. **Email** should already be enabled (it is by default)
3. To enable **Google Sign-In**:
   - Go to Authentication → Providers → Google
   - Toggle it ON
   - You'll need a Google OAuth Client ID and Secret from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
   - Set the redirect URL to: `https://yyzysoprhtconzbzsqsj.supabase.co/auth/v1/callback`

### 3. Environment Variables

The `.env.local` file should contain:

```
NEXT_PUBLIC_SUPABASE_URL=https://yyzysoprhtconzbzsqsj.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_cLMQC3JC0tAneiUPW4sLzg_aZz94NT7
```

## Deploy to Vercel (Free)

### Step 1: Push to GitHub

```bash
# Initialize git repo
git init
git add .
git commit -m "Initial commit — Sommeasy Wine DNA Quiz"

# Create a repo on GitHub (github.com/new), then:
git remote add origin https://github.com/YOUR_USERNAME/sommeasy.git
git branch -M main
git push -u origin main
```

### Step 2: Deploy on Vercel

1. Go to [vercel.com](https://vercel.com) and sign in with GitHub
2. Click **"Add New Project"**
3. Import your `sommeasy` repository
4. In **Environment Variables**, add:
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://yyzysoprhtconzbzsqsj.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `sb_publishable_cLMQC3JC0tAneiUPW4sLzg_aZz94NT7`
5. Click **Deploy**

Vercel will give you a URL like `sommeasy.vercel.app`.

### Step 3: Connect sommeasy.wine Domain

1. In Vercel: Go to your project → Settings → Domains → Add `sommeasy.wine`
2. Vercel will show you DNS records to add
3. In GoDaddy: Go to DNS Management for sommeasy.wine and add the records Vercel shows you (typically an A record and CNAME)
4. **Important**: Remove any existing A records or CNAME records that GoDaddy's website builder may have added

DNS propagation takes 15 minutes to 48 hours.

### Step 4: Update Supabase Auth Redirect

Once your domain is live, go to Supabase → Authentication → URL Configuration and add:
- Site URL: `https://sommeasy.wine`
- Redirect URLs: `https://sommeasy.wine/api/auth/callback`

## Project Structure

```
sommeasy/
├── src/
│   ├── app/
│   │   ├── page.js              # Home — welcome screen + quiz
│   │   ├── layout.js            # Root layout + metadata
│   │   ├── globals.css           # Global styles
│   │   ├── login/page.js        # Sign in page
│   │   ├── signup/page.js       # Create account page
│   │   └── api/auth/callback/   # Auth callback route
│   ├── components/
│   │   ├── Quiz.js              # The wine DNA quiz flow
│   │   └── AuthForm.js          # Login/signup form
│   └── lib/
│       ├── supabase.js          # Supabase client
│       ├── wineData.js          # Wine countries/regions/estates/varietals
│       └── profileEngine.js     # Archetype + recommendation engine
├── supabase/
│   └── migrations/
│       └── 001_create_profiles.sql  # Database schema
├── .env.local                   # Environment variables (not committed)
└── package.json
```

## Tech Stack

- **Frontend**: Next.js 14 (React)
- **Backend/Auth/DB**: Supabase (PostgreSQL + Auth)
- **Hosting**: Vercel (free tier)
- **Domain**: sommeasy.wine

## What's Next

- [ ] Wire quiz options to WineMag 130k dataset
- [ ] Build restaurant recommendation engine (price range + red/white + wine list URL)
- [ ] Wine list URL parsing and matching
- [ ] Profile editing and refinement over time
