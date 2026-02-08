# Foosball Rating Tracker

A full-stack foosball rating system deployed on Cloudflare's free tier. Uses [OpenSkill](https://github.com/nickbabcock/openskill.js) for multiplayer team-based rating (not ELO—see [Joshy, 2024](https://arxiv.org/abs/2401.05451)).

**Live App:** https://foosball.thomas-decloedt.be

> This repository is a read-only portfolio mirror. Deployment runs from the private upstream. To deploy your own instance, create the required Cloudflare resources and configure `wrangler.toml`.

## Features

- **OpenSkill Rating System**: Track player ratings with support for 1v1, 1v2, and 2v2 matches
- **Match Recording**: Log game results with automatic rating calculations
- **Leaderboard**: Real-time player rankings with position-specific stats (defense, attack, solo)
- **Match History**: Complete history of all games played
- **Player Profiles**: Individual stats, rating progression, and head-to-head records
- **Seasons**: Season tracking, MVP calculations, and match organization

## Tech Stack

- **Backend**: Cloudflare Workers + Hono
- **Frontend**: React 19 + Vite + TailwindCSS 4.1
- **Database**: Neon PostgreSQL + Cloudflare Hyperdrive
- **ORM**: Drizzle ORM
- **Session**: Cloudflare KV
- **Auth**: Scrypt password hashing
- **Cost**: $0/month

## Local Development

```bash
pnpm install
pnpm dev:api     # Cloudflare Workers (port 8787)
pnpm dev:client  # Vite dev server (port 3000)
```

## API Overview

- **Auth**: `/api/v1/auth/register`, `/login`, `/logout`, `/me`
- **Matches**: `POST /api/v1/match/create`, `GET /api/v1/matches`
- **Players**: `GET /api/v1/players` (leaderboard), `/players/:id` (profile), `/players/:id/history`

## Rating System

Uses [OpenSkill](https://github.com/nickbabcock/openskill.js) for asymmetric multiplayer teams:

- **Starting rating**: μ=25, σ=8.333
- **1v1**: Direct rating comparison
- **1v2**: Solo vs duo average; each duo player vs solo
- **2v2**: Each player vs opposing team average
- Position-specific ratings: defense, attack, solo

## Acknowledgments

Rating calculations use [OpenSkill.js](https://github.com/nickbabcock/openskill.js), based on [OpenSkill: A faster asymmetric multi-team, multiplayer rating system](https://arxiv.org/abs/2401.05451) (Joshy, 2024).

## License

PolyForm Noncommercial License 1.0.0. See [LICENSE](LICENSE).
