# Symphony AI Backend

This is the Node.js/Express backend service for the Symphony AI application. It acts as a secure proxy to AI services like Google Gemini and Suno, manages the song generation pipeline, and stores song data.

## Prerequisites

- Node.js (v18 or later recommended)
- npm

## Setup and Installation

1.  **Navigate to the server directory:**
    ```bash
    cd server
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## Environment Variables

This server requires the following environment variables to be set in your execution environment:

-   `API_KEY`: Your Google AI Studio API Key. Used for lyrics, cover art, and video generation. **(Required)**
-   `SUNO_API_KEY`: Your Suno AI API Key. Used for audio generation. **(Required for audio generation)**

**Note:** The server will fail to start if `API_KEY` is not provided. If `SUNO_API_KEY` is missing, audio generation will be mocked so the application can still function.

## Running the Server

After installing dependencies and ensuring your environment variables are set, start the server:

```bash
npm start
```

The server will start on `http://localhost:3001` by default. The frontend application is already configured to communicate with this address.
