import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';
import os from 'os';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import babel from '@babel/core';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Configure CORS for all routes
const corsOptions = {
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    preflightContinue: false,
    optionsSuccessStatus: 204,
    exposedHeaders: ['Content-Length', 'Content-Range', 'X-Content-Range'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Range'],
    credentials: true
};

app.use(cors(corsOptions));
app.use(express.json());

// --- Environment Variable Checks ---
if (!process.env.API_KEY) {
    console.error("FATAL ERROR: API_KEY environment variable not set.");
    process.exit(1);
}
if (!process.env.SUNO_API_KEY) {
    console.warn("WARNING: SUNO_API_KEY environment variable not set. Audio generation will be mocked.");
}

// Initialize the Google Generative AI client
const ai = new GoogleGenerativeAI(process.env.API_KEY);
const model = ai.getGenerativeModel({ model: 'gemini-1.5-flash' });

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
        const parsed = JSON.parse(data);
        
        // Update old audio URLs to use proxy format
        for (const songId in parsed) {
            const song = parsed[songId];
            if (song.audioUrl && song.audioUrl.startsWith('http')) {
                // Convert direct URLs to proxy URLs to avoid CORS
                song.audioUrl = `/api/proxy-audio?url=${encodeURIComponent(song.audioUrl)}`;
                console.log(`Updated audio URL for song: ${song.title}`);
            }
        }
        
        Object.assign(songs, parsed);
        console.log('Successfully loaded songs from db.json');
        
        // Save updated URLs back to file
        await saveSongs();
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
const SUNO_API_BASE = process.env.SUNO_API_BASE || 'https://api.suno.ai';

const generateSunoAudio = async (lyrics, prompt, genre, vocalGender, durationSecInput) => {
    const sunoPrompt = `${prompt}. A ${genre || 'pop'} song with ${vocalGender ? `${vocalGender} vocals` : 'vocals'}.`;
    const defaultDuration = Number(process.env.SUNO_DURATION_SEC || 270);
    const durationSec = Math.max(10, Math.min(Number(durationSecInput || defaultDuration) || defaultDuration, 480));

    // Try real Suno API if configured
    if (process.env.SUNO_API_KEY) {
        try {
            console.log("=== SUNO API ATTEMPT ===");
            console.log("API Key present:", !!process.env.SUNO_API_KEY);
            console.log("Requesting audio generation from Suno API...");
            console.log("Prompt:", sunoPrompt);
            console.log("Duration:", durationSec);

            // Use the correct Suno API endpoint - try different API versions
            let startRes;
            try {
                // Try v1 API first
                startRes = await fetch('https://api.suno.ai/v1/songs', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.SUNO_API_KEY}`
                    },
                    body: JSON.stringify({ 
                        prompt: sunoPrompt, 
                        lyrics: lyrics,
                        duration: durationSec,
                        make_instrumental: false,
                        wait_audio: false
                    })
                });
            } catch (e) {
                console.log("v1 API failed, trying generate endpoint...");
                // Try alternative endpoint
                startRes = await fetch('https://api.suno.ai/api/generate', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${process.env.SUNO_API_KEY}`
                    },
                    body: JSON.stringify({ 
                        prompt: sunoPrompt, 
                        lyrics: lyrics,
                        duration: durationSec
                    })
                });
            }

            if (!startRes.ok) {
                const text = await startRes.text().catch(() => '');
                console.error(`Suno API error ${startRes.status}:`, text);
                throw new Error(`Suno start failed ${startRes.status}: ${text}`);
            }
            
            const startJson = await startRes.json();
            console.log("Suno response:", startJson);
            
            const generationId = startJson.id || startJson[0]?.id;
            if (!generationId) throw new Error('Suno response missing job id');
            console.log(`Suno job ${generationId} started.`);

            // Polling for completion
            const maxPollMs = 5 * 60 * 1000; // 5 minutes
            const pollIntervalMs = 10000; // 10 seconds
            const started = Date.now();
            
            while (Date.now() - started < maxPollMs) {
                await new Promise(r => setTimeout(r, pollIntervalMs));
                console.log(`Polling Suno job ${generationId}...`);
                
                const statusRes = await fetch(`https://api.suno.ai/v1/songs/${generationId}`, {
                headers: { 'Authorization': `Bearer ${process.env.SUNO_API_KEY}` }
            });
                
                if (!statusRes.ok) {
                    console.warn(`Polling failed with status ${statusRes.status}`);
                    continue;
                }
                
                const status = await statusRes.json();
                console.log(`Job ${generationId} status:`, status.status);
                
                if (status.status === 'complete' || status.status === 'streaming') {
                    const audioUrl = status.audio_url || status.song_url;
                    if (audioUrl) {
                        console.log(`Suno job ${generationId} completed with audio URL:`, audioUrl);
                        return audioUrl;
                    }
                }
                
                if (status.status === 'error' || status.status === 'failed') {
                    throw new Error(status.error_message || 'Suno generation failed');
                }
            }
            throw new Error('Suno polling timeout after 5 minutes');
        } catch (err) {
            console.error('=== SUNO API FAILED ===');
            console.error('Error details:', err?.message || err);
            throw err; // Propagate the error to the pipeline
        }
    } else {
        console.log("=== NO SUNO API KEY: Using demo audio ===");
        
        // Array of demo audio URLs with different lengths for variety - use proxy URLs to avoid CORS
        const demoAudioUrls = [
            '/api/proxy-audio?url=' + encodeURIComponent('https://www.soundjay.com/misc/sounds/bell-ringing-05.wav'),
            '/api/proxy-audio?url=' + encodeURIComponent('https://www.learningcontainer.com/wp-content/uploads/2020/02/Kalimba.mp3'),
            '/api/proxy-audio?url=' + encodeURIComponent('https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/mp3/SampleAudio_0.4mb_mp3.mp3'),
            '/api/proxy-audio?url=' + encodeURIComponent('https://www.soundjay.com/misc/sounds/beep-07a.wav')
        ];
        
        // Select based on genre for variety
        let selectedIndex = 0;
        if (genre && genre.toLowerCase().includes('trance')) selectedIndex = 1;
        else if (genre && genre.toLowerCase().includes('pop')) selectedIndex = 2;
        else if (genre && genre.toLowerCase().includes('ambient')) selectedIndex = 3;
        else selectedIndex = Math.floor(Math.random() * demoAudioUrls.length);
        
        const selectedDemoUrl = demoAudioUrls[selectedIndex];
        
        console.log(`Selected demo audio for ${genre}: ${selectedDemoUrl}`);
        
        // Simulate processing time
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        return selectedDemoUrl;
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


        try {
            // Note: Video generation is not directly supported in the current version of the Google Generative AI SDK.
            // This is a placeholder for future implementation.
            console.warn('Video generation is currently not implemented in this version.');
            
            // For now, we'll just set a placeholder video URL
            song.videoUrl = 'https://example.com/placeholder-video.mp4';
            song.thumbnailUrl = song.coverArtUrl;
            song.status = GenerationStatus.COMPLETED;
            song.statusMessage = "Your song is ready! (Video generation is currently disabled)";
            await saveSongs();
            console.log(`[${songId}] Video generation placeholder set.`);
        } catch(error) {
            console.error(`[${songId}] Video generation failed:`, error);
            // Re-throw the error to be caught by the main generation pipeline
            throw error;
        }
    } catch (error) {
        console.error(`[${songId}] Video generation pipeline failed:`, error);
        song.status = GenerationStatus.FAILED;
        song.statusMessage = "Failed to generate video: " + (error.message || 'Unknown error');
        await saveSongs();
        throw error;
    }
};

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
    
    const result = await model.generateContent({
        contents: [{
            role: "user",
            parts: [{
                text: lyricsPrompt
            }]
        }],
        generationConfig: {
            temperature: temperature,
            topP: 0.95,
            topK: 64,
            maxOutputTokens: 4096,
        },
    });
    
    const response = result.response;
    song.lyrics = response.text().trim();
};

const stepGenerateAudio = async (songId) => {
    const song = songs[songId];
    console.log(`=== STEP GENERATE AUDIO CALLED FOR SONG ${songId} ===`);
    song.status = GenerationStatus.GENERATING_AUDIO;
    song.statusMessage = "Composing the music...";
    await saveSongs();
    console.log(`Calling generateSunoAudio for song: ${song.title}`);
    song.audioUrl = await generateSunoAudio(song.lyrics, song.prompt, song.genre, song.vocalGender);
    console.log(`Audio URL generated: ${song.audioUrl}`);
};

const stepGenerateArt = async (songId) => {
    const song = songs[songId];
    song.status = GenerationStatus.GENERATING_ART;
    song.statusMessage = "Creating the cover art...";
    await saveSongs();
    const artPrompt = `Album cover art for a ${song.genre} song titled "${song.title}" about "${song.prompt}". 
    Style: The visual style of "${song.videoStyle}" should be very prominent, with an influence level of ${song.styleInfluence || 50}%. 
    ${song.excludeStyles ? `Do NOT include any of the following styles or elements: ${song.excludeStyles}.` : ''}`.trim();

    try {
        // For v0.24.1, we'll use the text-to-image model
        const imageModel = ai.getGenerativeModel({ model: 'imagegeneration-001' });
        const result = await imageModel.generateContent({
            contents: [{
                role: "user",
                parts: [{
                    text: artPrompt
                }]
            }],
            generationConfig: {
                temperature: 0.4,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048,
            },
        });
        
        // Get the first image from the response
        const response = result.response;
        const imagePart = response.candidates?.[0]?.content?.parts?.[0];
        
        if (imagePart && imagePart.inlineData) {
            song.coverArtUrl = `data:image/png;base64,${imagePart.inlineData.data}`;
        } else {
            throw new Error('No image data in response');
        }
    } catch (billingError) {
        console.warn(`[${song.id}] Imagen unavailable or billing required.`, billingError?.message || billingError);
        throw billingError;
    }
}


// --- Main Asynchronous Generation Pipeline ---
const generationPipeline = async (songId, startStep = GenerationStatus.GENERATING_LYRICS) => {
    const song = songs[songId];
    if (!song) return;

    console.log(`=== GENERATION PIPELINE STARTED FOR ${songId} ===`);
    console.log(`Starting from step: ${startStep}`);

    try {
        const steps = [
            { status: GenerationStatus.GENERATING_LYRICS, execute: stepGenerateLyrics },
            { status: GenerationStatus.GENERATING_AUDIO, execute: stepGenerateAudio },
            { status: GenerationStatus.GENERATING_ART, execute: stepGenerateArt },
        ];
        
        let startIndex = steps.findIndex(step => step.status === startStep);
        if (startIndex < 0) startIndex = 0;

        console.log(`Executing ${steps.length - startIndex} steps starting from index ${startIndex}`);

        for (let i = startIndex; i < steps.length; i++) {
            const step = steps[i];
            console.log(`Executing step ${i}: ${step.status}`);
            await step.execute(songId);
            await saveSongs();
            console.log(`Step ${i} completed: ${step.status}`);
        }

        console.log(`Starting video generation for ${songId}`);
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
            const localAudio = '/audio/sample.wav';
            audioJobs[generationId] = { status: 'complete', url: localAudio };
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
        
        try {
            const result = await model.generateContent({
                contents: [{
                    role: "user",
                    parts: [{
                        text: metadataPrompt
                    }]
                }],
                generationConfig: {
                    temperature: temperature,
                    topP: 0.95,
                    topK: 64,
                    maxOutputTokens: 4096,
                },
            });
            
            const response = result.response;
            const responseText = response.text().trim();
            let cleanedText = responseText.replace(/^```json\s*/, '').replace(/```$/, '');
            const metadata = JSON.parse(cleanedText);
            Object.assign(initialSong, metadata);
        } catch (e) {
            console.error("Failed to parse metadata from Gemini:", e);
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

// Test endpoint for audio generation
apiRouter.post('/test-audio', async (req, res) => {
    try {
        console.log('=== TESTING AUDIO GENERATION ===');
        const testLyrics = "Test lyrics for audio generation";
        const testPrompt = "Test pop song";
        const testGenre = "pop";
        
        const audioUrl = await generateSunoAudio(testLyrics, testPrompt, testGenre, null, 30);
        console.log('Test audio URL:', audioUrl);
        
        res.json({ success: true, audioUrl });
    } catch (error) {
        console.error('Test audio generation failed:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- Routing, Transpilation & Static File Serving ---
const projectRoot = path.resolve(__dirname, '..');


// Simple audio proxy to avoid CORS on remote files for <audio> and WebAudio
app.get('/api/proxy-audio', async (req, res) => {
    // Set CORS headers for all responses (including errors)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Range, Authorization');
    res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const url = req.query.url;
        if (!url || typeof url !== 'string') {
            console.error('Missing or invalid URL parameter');
            return res.status(400).json({ error: 'Missing or invalid URL parameter' });
        }

        // Log the request for debugging
        console.log('Proxying audio request to:', url);
        console.log('Request headers:', req.headers);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept': 'audio/webm,audio/ogg,audio/wav,audio/*;q=0.9,application/ogg;q=0.7,video/*;q=0.6,*/*;q=0.5',
                'Accept-Encoding': 'identity;q=1, *;q=0',
                'Range': req.headers.range || '',
                'Referer': 'http://localhost:3000/',
                'Origin': 'http://localhost:3000'
            }
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error(`Failed to fetch audio: ${response.status} ${response.statusText}`, errorText);
            return res.status(response.status).json({ 
                error: 'Failed to fetch audio',
                status: response.status,
                statusText: response.statusText,
                details: errorText
            });
        }

        const contentType = response.headers.get('content-type') || 'audio/mpeg';
        const contentLength = response.headers.get('content-length');
        const acceptRanges = response.headers.get('accept-ranges') || 'bytes';
        
        // Set response headers
        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', acceptRanges);
        
        if (contentLength) {
            res.setHeader('Content-Length', contentLength);
        }
        
        // Handle range requests for seeking
        const range = req.headers.range;
        if (range) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : (contentLength ? parseInt(contentLength, 10) - 1 : 0);
            const chunksize = (end - start) + 1;
            
            res.setHeader('Content-Range', `bytes ${start}-${end}/${contentLength || '*'}`);
            res.setHeader('Content-Length', chunksize);
            res.status(206); // Partial Content
            
            if (response.body) {
                // Stream the response for better performance
                const reader = response.body.getReader();
                let received = 0;
                
                // Skip to the start position if needed
                if (start > 0) {
                    let skipped = 0;
                    while (skipped < start) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        skipped += value.length;
                    }
                }
                
                // Stream the requested range
                while (received < chunksize) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    
                    const chunk = value.slice(0, chunksize - received);
                    res.write(chunk);
                    received += chunk.length;
                    
                    if (received >= chunksize) break;
                }
                res.end();
                return;
            }
        }
        
        // If not a range request or streaming failed, send the whole response
        if (response.body) {
            // Stream the response for better performance
            const reader = response.body.getReader();
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                res.write(value);
            }
            res.end();
        } else {
            // Fallback for older Node.js versions
            const buffer = await response.arrayBuffer();
            res.end(Buffer.from(buffer));
        }
    } catch (e) {
        console.error('proxy-audio failed:', e);
        res.status(500).json({ 
            error: 'Proxy failed',
            message: e.message,
            stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
        });
    }
});

// Serve static files from the public directory (Vite build output)
const publicPath = path.join(__dirname, 'public');
const assetsPath = path.join(publicPath, 'assets');

// Serve static assets with proper caching and CORS headers
app.use('/assets', express.static(assetsPath, {
    immutable: true,
    maxAge: '1y',
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        
        // Set proper MIME types
        if (filePath.endsWith('.js')) {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (filePath.endsWith('.css')) {
            res.setHeader('Content-Type', 'text/css');
        } else if (filePath.endsWith('.json')) {
            res.setHeader('Content-Type', 'application/json');
        }
    }
}));

// Serve audio files with proper CORS headers
app.use('/audio', express.static(path.join(publicPath, 'audio'), {
    setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Cache-Control', 'public, max-age=604800'); // 1 week
    }
}));

// Serve other static files with proper caching
app.use(express.static(publicPath, {
    index: false,
    setHeaders: (res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
        res.setHeader('Cache-Control', 'public, max-age=3600'); // 1 hour
    }
}));

// Serve index.html for the root path
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            res.status(500).send('Error loading the application');
        }
    });
});

// SPA Fallback - For any GET request that hasn't been handled, serve the main HTML file
app.get('*', (req, res, next) => {
    // Skip API routes and static files
    if (req.path.startsWith('/api/') || 
        req.path.startsWith('/assets/') || 
        req.path.startsWith('/audio/') ||
        req.path.includes('.')) { // Skip files with extensions
        return next();
    }
    
    // Serve index.html for all other GET requests
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            if (!res.headersSent) {
                res.status(500).send('Error loading the application');
            }
        }
    });
});

// Babel transformation for JSX/TSX files (development only)
if (process.env.NODE_ENV !== 'production') {
    app.use('*', async (req, res, next) => {
        if (req.path.endsWith('.jsx') || req.path.endsWith('.tsx')) {
            try {
                const filePath = path.join(projectRoot, req.path.slice(1));
                const code = await fs.readFile(filePath, 'utf-8');
                const result = await babel.transformAsync(code, {
                    filename: filePath,
                    presets: [
                        ['@babel/preset-env', { targets: 'defaults' }],
                        ['@babel/preset-react', { runtime: 'automatic' }],
                        '@babel/preset-typescript'
                    ]
                });
                res.type('js').send(result.code);
            } catch (error) {
                console.error('Babel transform error:', error);
                next(error);
            }
        } else {
            next();
        }
    });
}

// Serve static files from the project root with proper CORS headers
app.use(express.static(projectRoot, {
    index: false,
    setHeaders: (res, filePath) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET');
        
        // Set appropriate content types based on file extension
        const ext = path.extname(filePath).toLowerCase();
        if (ext === '.js') {
            res.setHeader('Content-Type', 'application/javascript');
        } else if (ext === '.css') {
            res.setHeader('Content-Type', 'text/css');
        } else if (ext === '.json') {
            res.setHeader('Content-Type', 'application/json');
        }
    }
}));

// SPA Fallback - For any GET request that hasn't been handled, serve the main HTML file.
app.get('*', (req, res, next) => {
    // Skip API routes and static files
    if (req.path.startsWith('/api/') || 
        req.path.startsWith('/assets/') || 
        req.path.startsWith('/audio/') ||
        req.path.includes('.')) { // Skip files with extensions
        return next();
    }
    
    // Serve index.html for all other GET requests
    res.sendFile(path.join(__dirname, 'public', 'index.html'), (err) => {
        if (err) {
            console.error('Error sending index.html:', err);
            if (!res.headersSent) {
                res.status(500).send('Error loading the application');
            }
        }
    });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Server error:', err);
    if (!res.headersSent) {
        res.status(500).json({ 
            error: 'Internal Server Error', 
            message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message 
        });
    }
});

// 404 Handler - Catches any request that didn't match any of the above
app.use((req, res) => {
    if (!res.headersSent) {
        res.status(404).send('Not Found');
    }
});

loadSongs().then(() => {
    const server = app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log(`Network URL: http://${os.hostname()}:${PORT}`);
        console.log('Press Ctrl+C to stop the server');
    });

    // Handle server errors
    server.on('error', (error) => {
        if (error.code === 'EADDRINUSE') {
            console.error(`Port ${PORT} is already in use. Please stop any other servers using this port.`);
        } else {
            console.error('Server error:', error);
        }
        process.exit(1);
    });
}).catch(error => {
    console.error('Failed to start server:', error);
    process.exit(1);
});
