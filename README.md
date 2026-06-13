# AuraFlow: Real-Time Bun & Vite React Workspace

AuraFlow is a premium, full-stack, real-time metrics and project management dashboard. It uses a high-performance **Bun HTTP & WebSocket Server** backend and a modern, glassmorphic **Vite React & TypeScript** frontend.

---

## ⚡ Architecture Overview

```mermaid
graph TD
    Client[Vite React Frontend] <-->|WebSocket: Real-time Metrics & Task Sync| Server[Bun API Server]
    Client -->|HTTP REST: CRUD Commands| Server
```

### Key Highlights
*   **Orchestrated Startup**: Run both the server and client dev servers concurrently with a single command (`bun run dev`).
*   **Zero-Dependency Realtime Sync**: Leverages Bun's native WebSocket pub/sub system to propagate Kanban task updates and server performance stats across all open browser tabs instantly.
*   **Cyberpunk Design Aesthetic**: Styled using CSS variables, custom smooth transitions, glassmorphic panels, animated status indicators, and custom scrollbars.
*   **Diagnostics Suite**: Displays live JS Heap Memory, RSS allocations, WebSocket connections, and server uptime.
*   **Interactive Session Chat**: In-memory global chat logs that propagate in real time to all connected clients.

---

## 📂 Project Structure

```text
MyApp/
├── package.json           # Root workspace scripts
├── dev.ts                 # Dev server orchestrator script
├── README.md              # Documentation
├── server/
│   ├── index.ts           # Bun HTTP & WebSocket Server logic
│   ├── package.json       # Backend configurations & devDependencies
│   └── tsconfig.json      # TypeScript configurations for server
└── client/
    ├── index.html         # HTML entry point (SEO optimized)
    ├── package.json       # React & Vite client dependencies
    ├── vite.config.ts     # Vite configuration
    └── src/
        ├── main.tsx       # React mounting entry
        ├── App.tsx        # Dashboard interface (Kanban, metrics & chat)
        └── index.css      # Core premium design system stylesheet
```

---

## 🚀 Getting Started

### 1. Prerequisite
Ensure that [Bun](https://bun.sh) is installed on your system.

### 2. Run in Development Mode
To start both the Bun backend server and the Vite React client concurrently, run the following command in the project root:

```bash
bun run dev
```

The orchestrator will spin up:
*   **Bun Server**: [http://localhost:3001](http://localhost:3001)
*   **Vite Client**: [http://localhost:5173](http://localhost:5173) (or the next available port, e.g., `5174`)

### 3. Stop Dev Servers
Simply press `Ctrl+C` in your terminal. The orchestrator will catch the interrupt and cleanly terminate both backend and frontend processes.

---

## 🔌 API Documentation

### REST HTTP Endpoints (`http://localhost:3001`)

| Method | Endpoint | Description |
| :--- | :--- | :--- |
| `GET` | `/api/metrics` | Fetches current system specs & memory diagnostics. |
| `GET` | `/api/tasks` | Retrieves all tasks in the Kanban board. |
| `POST` | `/api/tasks` | Creates a new task (expects JSON body). |
| `PUT` | `/api/tasks/:id` | Updates task status, title, description, or priority. |
| `DELETE` | `/api/tasks/:id` | Deletes a task by ID. |

### WebSocket Endpoint (`ws://localhost:3001/ws`)
Used for real-time notifications. On connection, the client subscribes to:
1.  `metrics` channel: Receives live performance stats updates every second.
2.  `activity` channel: Receives notifications on task alterations and global messages.

#### WebSocket Event Payloads
*   `{ type: "init", data: { metrics, tasks } }`: Initial state sent upon connection opening.
*   `{ type: "metrics", data: metrics }`: Broadcasted every 1s (includes RAM, Uptime, connection count).
*   `{ type: "task_created", data: task }`: Broadcasted when any user creates a task.
*   `{ type: "task_updated", data: task }`: Broadcasted when a task status shifts or details edit.
*   `{ type: "task_deleted", data: { id } }`: Broadcasted when a task is deleted.
*   `{ type: "chat_message", data: chatMessage }`: Broadcasted when a message is sent via session log.

---

## 🎨 Theme & Customization
Styling tokens are defined as CSS variables at the top of [client/src/index.css](file:///C:/Users/sanpa/OneDrive/Desktop/Fun%20projects/MyApp/client/src/index.css):
*   To edit the cyberpunk accents, update `--primary` (violet), `--secondary` (cyan), or `--accent` (rose).
*   To modify fonts, update `--font-heading` (`Outfit`) or `--font-body` (`Plus Jakarta Sans`).
