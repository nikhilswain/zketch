# Zketch

A simple drawing app where you can sketch anything you want. Supports multiple brush types and saves your drawings locally in a personal vault.

## Features

- Freehand drawing with pressure sensitivity
- Multiple brushes: pen, marker, brush etc.
- Save drawings to local vault
- Zoom and pan around canvas
- Undo/redo support
- Export drawings as images
- Keyboard shortcuts
- Works on desktop hopefully on mobile too. I'm not gonna check tho I have a life to live.

## Tech Stack

- React 19
- Astro 5
- MobX State Tree
- IndexedDB/Dexie.js
- Tailwind CSS
- Radix UI / Shadcn
- Perfect Freehand

## Installation

```bash
git clone <repo-url>
cd zketch
npm install
npm run dev
```

That's it! Your drawings are saved locally, you're responsible for clearing the data entirely from browser.
