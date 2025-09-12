import { Difficulty, Song, AdvancedOptions } from "../types.ts";

const API_BASE = '/api';

async function handleResponse<T>(response: Response): Promise<T> {
    if (response.ok) {
        // The request was successful, parse and return the JSON body.
        return response.json();
    }

    // The request failed, so we'll construct a user-friendly error message.
    let userMessage: string;

    // Provide specific messages for common client and server errors.
    switch (response.status) {
        case 400:
            userMessage = "Bad Request: The server could not understand the request due to invalid syntax.";
            break;
        case 401:
            userMessage = "Unauthorized: Authentication is required and has failed or has not yet been provided. Please check your API key.";
            break;
        case 403:
            userMessage = "Forbidden: You do not have permission to access this resource.";
            break;
        case 404:
            userMessage = "Not Found: The requested resource could not be found on the server.";
            break;
        case 500:
            userMessage = "Internal Server Error: Something went wrong on our end. Please try again later.";
            break;
        case 503:
             userMessage = "Service Unavailable: The server is currently unable to handle the request. Please try again later.";
             break;
        default:
            userMessage = `An unexpected error occurred. Status: ${response.status}`;
            break;
    }

    // Attempt to get a more detailed error message from the response body.
    try {
        const errorData = await response.json();
        // If the server provides a specific message, append it for more context.
        if (errorData && errorData.message) {
            userMessage += ` - ${errorData.message}`;
        }
    } catch (e) {
        // If the response body isn't JSON or is empty, we'll stick with the status-based message.
        console.warn("Could not parse JSON from error response.", e);
    }
    
    // Throw an error that will be caught by the calling service and displayed in the UI.
    throw new Error(userMessage);
}

export const getAllSongs = async (): Promise<Song[]> => {
    const response = await fetch(`${API_BASE}/songs`);
    return handleResponse<Song[]>(response);
};

export const generateSong = async (
    prompt: string, 
    customLyrics?: string, 
    videoStyle?: string, 
    difficulty?: Difficulty,
    advancedOptions?: AdvancedOptions
): Promise<Song> => {
    const response = await fetch(`${API_BASE}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, customLyrics, videoStyle, difficulty, advancedOptions }),
    });
    return handleResponse<Song>(response);
};

export const getSong = async (songId: string): Promise<Song> => {
    const response = await fetch(`${API_BASE}/songs/${songId}`);
    return handleResponse<Song>(response);
};

export const retrySong = async (song: Song): Promise<Song> => {
    const response = await fetch(`${API_BASE}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song }),
    });
    return handleResponse<Song>(response);
};

export const regenerateVideo = async (song: Song, videoStyle: string, difficulty: Difficulty): Promise<Song> => {
    const response = await fetch(`${API_BASE}/regenerate-video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ song, videoStyle, difficulty }),
    });
    return handleResponse<Song>(response);
}