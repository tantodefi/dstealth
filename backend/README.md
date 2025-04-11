# XMTP MiniApp Backend

A Node.js backend service for the XMTP MiniApp that handles XMTP operations.

## Setup

1. Clone the repository
2. Navigate to the backend directory
3. Install dependencies:

```bash
npm install
# or
bun install
```

4. Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

5. Fill in the required environment variables in the `.env` file:
   - `API_SECRET_KEY`: Generate with `openssl rand -base64 32`
   - `XMTP_PRIVATE_KEY`: Your XMTP private key
   - `XMTP_ENCRYPTION_KEY`: Get yours using `bun run gen:keys`
   - `XMTP_DEFAULT_CONVERSATION_ID`: The ID of your default group conversation

## Running the server

Development mode with hot reloading:

```bash
npm run dev
# or
bun run dev
```

Production mode:

```bash
npm run build
npm start
# or
bun run build
bun start
```

## API endpoints

The server runs on port `5001` by default (configurable in .env).

### Public endpoints

- `GET /health`: Health check endpoint

### Protected endpoints

All protected endpoints require the `API_SECRET_KEY` to be provided in the
request headers as `x-api-secret`.

- `POST /api/xmtp/add-inbox`: Add a user to the default group chat

## Environment variables

- `PORT`: Server port (default: 5001)
- `NODE_ENV`: Environment mode (development/production)
- `API_SECRET_KEY`: Secret key for API authentication
- `XMTP_PRIVATE_KEY`: XMTP private key
- `XMTP_ENCRYPTION_KEY`: XMTP encryption key
- `XMTP_ENV`: XMTP environment (dev/local/production)
- `XMTP_DEFAULT_CONVERSATION_ID`: Default XMTP conversation ID

## Requirements

- Node.js >= 20
