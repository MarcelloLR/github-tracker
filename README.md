# Github Tracker

A personal dashboard for tracking your open source contributions over time — built for developers who want more signal than GitHub's activity heatmap provides.

## What it does

OSTrack connects to your GitHub account and gives you a meaningful view of your open source work: PRs opened and merged, code reviews given, issues filed, contribution streaks, and impact metrics like average PR cycle time and engagement. You can set weekly or monthly contribution goals, track your progress, and export a portfolio summary for your resume or profile.

## Why it exists

GitHub shows you *what* you did. OSTrack helps you understand *how much*, *how consistently*, and *how effectively* — and holds you accountable to goals you set yourself.

## Tech stack

- **Frontend & Backend:** Next.js (App Router)
- **Database:** PostgreSQL via Prisma ORM
- **Auth:** GitHub OAuth via NextAuth.js
- **Background sync:** BullMQ + Redis
- **Charts:** Recharts
- **Deployment:** Fly.io

## Features

- GitHub OAuth login — sign in with your GitHub account, no manual setup
- Automatic data sync — contribution data refreshes in the background every few hours
- Goal tracking — set targets for PRs, reviews, or issues per week or month
- Streak tracking — defined by you, not GitHub's default activity counter
- Impact metrics — PR cycle time, engagement, cross-repo consistency
- Portfolio export — shareable public page summarizing your contributions

## Getting started

```bash
git clone https://github.com/yourname/ostrack.git
cd ostrack
cp .env.example .env       # add your GitHub OAuth credentials and database URL
npm install
npm run db:migrate
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) and sign in with GitHub.

## Roadmap

- [ ] Multi-account support (personal + work GitHub)
- [ ] Webhook-based real-time sync
- [ ] Weekly email digest
- [ ] Team comparison view

## License

MIT
