# Launcher

A fast, extensible productivity launcher for Windows — inspired by Raycast.

## Architecture

```
launcher/
├── src/
│   ├── host/                 # WPF .NET 8 host (hotkey, tray, WebView2)
│   │   ├── Launcher.Host/       # C# project
│   │   └── Launcher.Host.Tests/
│   ├── frontend/            # React + Vite UI rendered in WebView2
│   │   ├── src/
│   │   │   ├── components/
│   │   │   ├── views/
│   │   │   ├── hooks/
│   │   │   ├── stores/
│   │   │   └── main.tsx
│   │   ├── index.html
│   │   ├── vite.config.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── backend/             # Node.js WebSocket backend
│   │   ├── src/
│   │   │   ├── server/         # WebSocket IPC server
│   │   │   ├── handlers/       # App search, clipboard, calculator, etc.
│   │   │   ├── indexer/        # File indexer
│   │   │   ├── extensions/     # Extension runtime
│   │   │   ├── ai/             # AI integration
│   │   │   └── index.ts
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── extension-sdk/       # TypeScript SDK for extension authors
│       ├── src/
│       │   └── api.ts
│       └── package.json
├── scripts/
├── docs/
├── .gitignore
└── README.md
```

## Features (MVP)

- [ ] Global hotkey launcher (Alt+Space)
- [ ] App discovery & search
- [ ] Clipboard history
- [ ] File search indexer
- [ ] Calculator
- [ ] Extension system
- [ ] AI integration

## Tech Stack

| Layer       | Technology                          |
|-------------|-------------------------------------|
| Host        | .NET 8, WPF, WebView2               |
| Frontend    | React 19, Vite, TypeScript          |
| Backend     | Node.js, WebSocket, SQLite          |
| Extensions  | TypeScript SDK + React reconciler   |
| Indexer     | Rust (or Node.js native addon)      |

## Getting Started

```bash
# Install frontend deps
cd src/frontend && npm install

# Install backend deps
cd src/backend && npm install

# Dev mode (starts frontend dev server + backend WS)
npm run dev
```

## License

MIT
