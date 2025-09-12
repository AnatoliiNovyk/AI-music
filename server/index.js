import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import babel from '@babel/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

// --- Environment Variable Checks ---
if (!process.env.API_KEY) {
    console.error("FATAL ERROR: API_KEY environment variable not set.");
    process.exit(1);
}
if (!process.env.SUNO_API_KEY) {
    console.warn("WARNING: SUNO_API_KEY environment variable not set. Audio generation will be mocked.");
}

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// --- In-Memory Data Stores & Persistence ---
const DB_PATH = path.resolve(__dirname, 'db.json');
let songs = {}; // Will be populated by loadSongs
const audioJobs = {}; // For tracking audio-specific generation tasks

const saveSongs = async () => {
    try {
        await fs.writeFile(DB_PATH, JSON.stringify(songs, null, 2));
    } catch (error) {
        console.error("Failed to save songs to disk:", error);
    }
};

const loadSongs = async () => {
    try {
        const data = await fs.readFile(DB_PATH, 'utf8');
        songs = JSON.parse(data);
        console.log("Successfully loaded songs from db.json");
    } catch (error) {
        if (error.code === 'ENOENT') {
            console.log("db.json not found, starting with an empty library.");
            songs = {};
        } else {
            console.error("Failed to load songs from db.json:", error);
            process.exit(1); // Exit if the db is corrupt
        }
    }
};


// --- Generation Status Enum (mirrors frontend) ---
const GenerationStatus = {
    GENERATING_LYRICS: "writing lyrics",
    GENERATING_AUDIO: "composing music",
    GENERATING_ART: "creating cover art",
    GENERATING_VIDEO: "directing video",
    POLLING_VIDEO: "rendering video",
    COMPLETE: "complete",
    ERROR: "error"
};

// --- Suno AI API Integration (Implemented via local endpoints) ---
const PORT = process.env.PORT || 3001;
const API_URL_BASE = `http://localhost:${PORT}`;

const generateSunoAudio = async (lyrics, prompt, genre, vocalGender) => {
    console.log("Requesting audio generation from local endpoint...");
    const sunoPrompt = `${prompt}. A ${genre || 'pop'} song with ${vocalGender ? `${vocalGender} vocals` : 'vocals'}.`;

    // Step 1: Initiate generation by calling our own API
    const initiateResponse = await fetch(`${API_URL_BASE}/api/generate-audio`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lyrics, prompt: sunoPrompt }),
    });
    if (!initiateResponse.ok) {
        throw new Error('Failed to initiate audio generation.');
    }
    const { generationId } = await initiateResponse.json();
    console.log(`Audio job started with ID: ${generationId}`);

    // Step 2: Poll for completion
    while (true) {
        await new Promise(resolve => setTimeout(resolve, 5000)); // Poll every 5 seconds
        console.log(`Polling audio status for job ${generationId}...`);
        const statusResponse = await fetch(`${API_URL_BASE}/api/audio-status/${generationId}`);
        if (!statusResponse.ok) {
            throw new Error(`Polling failed for audio job ${generationId}`);
        }
        const statusData = await statusResponse.json();

        if (statusData.status === 'complete') {
            console.log(`Audio job ${generationId} complete.`);
            return statusData.url;
        } else if (statusData.status === 'error') {
            throw new Error(statusData.message || 'Audio generation failed.');
        }
        // else, status is 'generating', so we continue the loop
    }
};

// --- Video Generation Logic ---
const generateVideoForSong = async (songId) => {
    const song = songs[songId];
    if (!song) return;
    
    try {
        song.status = GenerationStatus.GENERATING_VIDEO;
        song.statusMessage = "Directing the music video...";
        await saveSongs();
        console.log(`[${songId}] Generating video...`);

        // Prepare image data for Veo if cover art exists
        let veoImageInput;
        if (song.coverArtUrl) {
            const parts = song.coverArtUrl.split(',');
            if (parts.length === 2 && parts[0] === 'data:image/png;base64') {
                veoImageInput = {
                    imageBytes: parts[1],
                    mimeType: 'image/png',
                };
                console.log(`[${songId}] Using generated cover art as input for video generation.`);
            }
        }
        
        const videoPrompt = `A music video for a song titled "${song.title}" with the theme "${song.prompt}". 
        The video must strictly adhere to the ${song.videoStyle} style. The influence of this style should be ${song.styleInfluence || 50}%. 
        ${song.excludeStyles ? `The video must not contain any of the following visual elements or styles: ${song.excludeStyles}.` : ''}`.trim();


        let operation = await ai.models.generateVideos({
            model: 'veo-2.0-generate-001',
            prompt: videoPrompt,
            image: veoImageInput,
            config: { numberOfVideos: 1 }
        });

        song.status = GenerationStatus.POLLING_VIDEO;
        song.statusMessage = "Rendering the final cut...";
        await saveSongs();
        while (!operation.done) {
            console.log(`[${songId}] Polling video status...`);
            await new Promise(resolve => setTimeout(resolve, 10000));
            operation = await ai.operations.getVideosOperation({ operation });
        }

        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
        if (downloadLink) {
            song.videoUrl = `${downloadLink}&key=${process.env.API_KEY}`;
            song.thumbnailUrl = song.coverArtUrl;
            song.status = GenerationStatus.COMPLETE;
            song.statusMessage = "Your masterpiece is ready!";
            console.log(`[${songId}] Video generation complete.`);
        } else {
            throw new Error("Video generation completed but no download link was found.");
        }
    } catch(error) {
        console.error(`[${songId}] Video generation failed:`, error);
        song.status = GenerationStatus.ERROR;
        song.failedStep = GenerationStatus.GENERATING_VIDEO;
        song.statusMessage = error.message || "Failed to generate video.";
    } finally {
        await saveSongs();
    }
}

// --- Generation Step Functions ---

const stepGenerateLyrics = async (songId) => {
    const song = songs[songId];
    if (song.lyrics) {
        console.log(`[${songId}] Skipping lyrics generation, custom lyrics provided.`);
        return;
    }
    const temperature = 0.5 + ((song.weirdness || 50) / 100) * 0.5;
    song.status = GenerationStatus.GENERATING_LYRICS;
    song.statusMessage = "Crafting the perfect words...";
    await saveSongs();
    console.log(`[${songId}] Generating lyrics with temperature ${temperature}...`);
    const lyricsPrompt = `Write lyrics for a song about: ${song.prompt}. 
    The song should have a clear structure (e.g., Verse, Chorus, Bridge). 
    Genre: ${song.genre || 'pop'}. 
    ${song.vocalGender ? `The vocals should be performed by a ${song.vocalGender} singer.` : ''}`.trim();
    
    const response = await ai.models.generateContent({ 
        model: 'gemini-2.5-flash', 
        contents: lyricsPrompt,
        config: { temperature }
    });
    song.lyrics = response.text.trim();
};

const stepGenerateAudio = async (songId) => {
    const song = songs[songId];
    song.status = GenerationStatus.GENERATING_AUDIO;
    song.statusMessage = "Composing the music...";
    await saveSongs();
    song.audioUrl = await generateSunoAudio(song.lyrics, song.prompt, song.genre, song.vocalGender);
};

const stepGenerateArt = async (songId) => {
    const song = songs[songId];
    song.status = GenerationStatus.GENERATING_ART;
    song.statusMessage = "Creating the cover art...";
    await saveSongs();
    const artPrompt = `Album cover art for a ${song.genre} song titled "${song.title}" about "${song.prompt}". 
    Style: The visual style of "${song.videoStyle}" should be very prominent, with an influence level of ${song.styleInfluence || 50}%. 
    ${song.excludeStyles ? `Do NOT include any of the following styles or elements: ${song.excludeStyles}.` : ''}`.trim();

    const imageResponse = await ai.models.generateImages({
        model: 'imagen-4.0-generate-001',
        prompt: artPrompt,
        config: { numberOfImages: 1, aspectRatio: '1:1' }
    });
    const base64Image = imageResponse.generatedImages[0].image.imageBytes;
    song.coverArtUrl = `data:image/png;base64,${base64Image}`;
};


// --- Main Asynchronous Generation Pipeline ---
const generationPipeline = async (songId, startStep = GenerationStatus.GENERATING_LYRICS) => {
    const song = songs[songId];
    if (!song) return;

    try {
        const steps = [
            { status: GenerationStatus.GENERATING_LYRICS, execute: stepGenerateLyrics },
            { status: GenerationStatus.GENERATING_AUDIO, execute: stepGenerateAudio },
            { status: GenerationStatus.GENERATING_ART, execute: stepGenerateArt },
        ];
        
        let startIndex = steps.findIndex(step => step.status === startStep);
        if (startIndex < 0) startIndex = 0;

        for (let i = startIndex; i < steps.length; i++) {
            const step = steps[i];
            await step.execute(songId);
            await saveSongs();
        }

        await generateVideoForSong(songId);

    } catch (error) {
        console.error(`[${songId}] Generation pipeline failed at status ${song.status}:`, error);
        song.failedStep = song.status;
        song.status = GenerationStatus.ERROR;
        song.statusMessage = error.message || "An unknown error occurred during generation.";
        await saveSongs();
    }
};

// --- API Router ---
const apiRouter = express.Router();

apiRouter.post('/generate-audio', (req, res) => {
    try {
        const { lyrics, prompt } = req.body;
        const generationId = `suno_job_${uuidv4()}`;

        console.log(`[Suno Worker] Received job ${generationId} for prompt: "${prompt}"`);
        audioJobs[generationId] = { status: 'generating' };
        
        setTimeout(() => {
            console.log(`[Suno Worker] Job ${generationId} finished.`);
            const mockAudioUrl = 'https://cdn.pixabay.com/audio/2024/02/26/audio_4088805a3w.mp3';
            audioJobs[generationId] = { status: 'complete', url: mockAudioUrl };
        }, 20000);

        res.status(202).json({ generationId });
    } catch (error) {
        console.error('Error in /api/generate-audio:', error);
        res.status(500).json({ message: 'Failed to start audio generation.' });
    }
});

apiRouter.get('/audio-status/:generationId', (req, res) => {
    try {
        const job = audioJobs[req.params.generationId];
        if (job) {
            res.json(job);
        } else {
            res.status(404).json({ message: 'Audio generation job not found.' });
        }
    } catch (error) {
        console.error(`Error in /api/audio-status/${req.params.generationId}:`, error);
        res.status(500).json({ message: 'Failed to retrieve audio status.' });
    }
});

apiRouter.post('/generate', async (req, res) => {
    try {
        const { prompt, customLyrics, videoStyle, difficulty, advancedOptions } = req.body;
        if (!prompt) return res.status(400).json({ message: 'Prompt is required.' });

        const songId = uuidv4();
        const initialSong = {
            id: songId,
            prompt,
            title: `Song about ${prompt.substring(0, 20)}...`,
            lyrics: customLyrics || '',
            status: GenerationStatus.GENERATING_LYRICS,
            statusMessage: "Initializing...",
            videoStyle: videoStyle || 'Cinematic',
            difficulty: difficulty || 'Medium',
            createdAt: new Date(),
            ...advancedOptions,
        };
        
        const temperature = 0.5 + ((advancedOptions?.weirdness || 50) / 100) * 0.5;
        const metadataPrompt = `Based on the song description "${prompt}", generate a short, catchy title (max 5 words), a music genre, a tempo in BPM (number only), a key signature, and 3 relevant tags (comma-separated). Return ONLY a JSON object with keys: "title", "genre", "tempo", "keySignature", "tags".`;
        const metadataResponse = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: metadataPrompt,
            config: { responseMimeType: 'application/json', temperature }
        });
        
        try {
            let cleanedText = metadataResponse.text.trim().replace(/^```json\s*/, '').replace(/```$/, '');
            const metadata = JSON.parse(cleanedText);
            Object.assign(initialSong, metadata);
        } catch (e) {
            console.error("Failed to parse metadata from Gemini:", e, "Raw response:", metadataResponse.text);
            // If metadata fails, we still proceed but with default values.
        }

        songs[songId] = initialSong;
        await saveSongs();
        res.status(201).json(initialSong);

        generationPipeline(songId);

    } catch (error) {
        console.error('Error in /api/generate:', error);
        res.status(500).json({ message: error.message || 'Failed to start song generation.' });
    }
});

apiRouter.get('/songs', (req, res) => {
    try {
        const sortedSongs = Object.values(songs).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        res.json(sortedSongs);
    } catch (error) {
        console.error('Error in /api/songs:', error);
        res.status(500).json({ message: 'Failed to retrieve songs.' });
    }
});

apiRouter.get('/songs/:id', (req, res) => {
    try {
        const song = songs[req.params.id];
        if (song) {
            res.json(song);
        } else {
            res.status(404).json({ message: 'Song not found.' });
        }
    } catch (error) {
        console.error(`Error in /api/songs/${req.params.id}:`, error);
        res.status(500).json({ message: 'Failed to retrieve song.' });
    }
});

apiRouter.post('/retry', async (req, res) => {
    try {
        const { song } = req.body;
        if (!song || !song.id || !song.failedStep) {
            return res.status(400).json({ message: "Invalid song data for retry." });
        }

        const existingSong = songs[song.id];
        if (!existingSong) return res.status(404).json({ message: "Song not found to retry." });
        
        console.log(`[${song.id}] Retrying from step: ${song.failedStep}`);
        const startStep = song.failedStep;
        existingSong.status = startStep;
        existingSong.statusMessage = "Retrying...";
        existingSong.failedStep = undefined;
        
        await saveSongs();
        res.json(existingSong);

        generationPipeline(song.id, startStep);
    } catch (error) {
        console.error('Error in /api/retry:', error);
        res.status(500).json({ message: 'Failed to retry song generation.' });
    }
});

apiRouter.post('/regenerate-video', async (req, res) => {
    try {
        const { song, videoStyle, difficulty } = req.body;
        if (!song || !song.id) return res.status(400).json({ message: "Invalid song data." });

        const existingSong = songs[song.id];
        if (!existingSong) return res.status(404).json({ message: "Song not found." });

        console.log(`[${song.id}] Regenerating video with style: ${videoStyle}`);
        Object.assign(existingSong, { videoStyle, difficulty, videoUrl: undefined, thumbnailUrl: undefined });
        await saveSongs();
        res.json(existingSong);

        generateVideoForSong(song.id);
    } catch (error) {
        console.error('Error in /api/regenerate-video:', error);
        res.status(500).json({ message: 'Failed to regenerate video.' });
    }
});

// --- Routing, Transpilation & Static File Serving ---
const projectRoot = path.resolve(__dirname, '..');

// 1. API Routes - These are the most specific and should come first.
app.use('/api', apiRouter);

// 2. Transpilation Middleware - Catches .ts/.tsx requests before static middleware.
app.use(async (req, res, next) => {
    if (req.path.endsWith('.tsx') || req.path.endsWith('.ts')) {
        const filePath = path.join(projectRoot, req.path.slice(1));
        
        try {
            if (!existsSync(filePath)) {
                return next(); // Let the 404 handler catch it
            }
            
            const source = await fs.readFile(filePath, 'utf8');
            
            const result = await babel.transformAsync(source, {
                filename: filePath,
                presets: [
                    "@babel/preset-typescript",
                    ["@babel/preset-react", { "runtime": "automatic" }],
                    "@babel/preset-env"
                ],
            });

            if (result?.code) {
                res.setHeader('Content-Type', 'application/javascript');
                return res.send(result.code);
            }
        } catch (error) {
            console.error(`Babel compilation error for ${filePath}:`, error);
            res.status(500).json({ message: `Error during server-side transpilation for ${req.path}` });
            return;
        }
    }
    next();
});

// 3. Static Assets - Serve other files like CSS, images, etc.
// `index: false` prevents express.static from serving index.html on its own,
// allowing our SPA fallback to handle it.
app.use(express.static(projectRoot, { index: false }));


const CORRECT_IMPORT_MAP = `<script type="importmap">
{
  "imports": {
    "react": "https://esm.sh/react@18.3.1",
    "react/jsx-runtime": "https://esm.sh/react@18.3.1/jsx-runtime",
    "react-dom/client": "https://esm.sh/react-dom@18.3.1/client"
  }
}
</script>`;

// 4. SPA Fallback - For any GET request that hasn't been handled, serve the main HTML file.
// This is the entry point for the React app.
app.get('*', async (req, res) => {
    try {
        const indexPath = path.resolve(projectRoot, 'index.html');
        const html = await fs.readFile(indexPath, 'utf-8');
        // Replace any existing importmap with the correct one, guaranteed.
        const modifiedHtml = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, CORRECT_IMPORT_MAP);
        res.setHeader('Content-Type', 'text/html').send(modifiedHtml);
    } catch (err) {
        console.error("SPA Fallback error:", err);
        res.status(500).send("Internal Server Error: Could not serve application.");
    }
});

// 5. Final 404 Handler - Catches any request that didn't match any of the above.
app.use((req, res) => {
    if (!res.headersSent) {
      res.status(404).send('Not Found');
    }
});

loadSongs().then(() => {
    app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
});
