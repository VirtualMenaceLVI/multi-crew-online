# Multi-Crew Online

A 2D multiplayer starship bridge crew simulation, inspired by cooperative command gameplay.

## Quick Start

```bash
npm install
npm start
# Open http://localhost:3000
```

## Development Login

In dev mode, use `admin` / `admin` to sign in instantly.

## Folder Structure

```
multi-crew-online/
├── index.html          Main SPA entry point
├── public/
│   ├── css/            Stylesheets
│   └── js/             Frontend JavaScript modules
├── server/
│   ├── server.js       Express server
│   ├── api-routes.js   REST API endpoints
│   └── dev-data-manager.js  JSON file read/write layer
├── data/               JSON persistence (dev mode)
│   ├── ships.json
│   ├── sectors.json
│   ├── players.json
│   └── communications.json
└── package.json
```

## Stations

| Station | Role |
|---------|------|
| Helm | Navigation, speed, heading |
| Tactical | Weapons, shields, targeting |
| Captain | Command overview, alerts |
| Engineering | Power management, hull |
| First Officer | Crew roster, mission log |
| Comms | Hailing, crew chat |

## Architecture

- **Frontend**: Vanilla HTML/CSS/JS, no framework
- **Backend**: Node.js + Express serving JSON files
- **Data**: All state in `/data/*.json` — swap for a real DB later
- **API**: REST endpoints under `/api/` — WebSocket-ready
- **Maps**: Canvas-based sector (1000×1000 km) with real-time ship positions
