import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { Song } from './types.ts';
import { GenerationStatus, Difficulty } from './types.ts';
import { getAllSongs, generateSong, getSong, retrySong, regenerateVideo } from './services/geminiService.ts';

import CreateForm from './components/CreateForm.tsx';
import Library from './components/Library.tsx';
import SongDetailModal from './components/SongDetailModal.tsx';
import type { AdvancedOptions } from './types.ts';

const App: React.FC = () => {
    const [songs, setSongs] = useState<Song[]>([]);
    const [selectedSongId, setSelectedSongId] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isGenerating, setIsGenerating] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const pollingRef = useRef<Set<string>>(new Set());
    const selectedSong = songs.find(s => s.id === selectedSongId) || null;

    const fetchSongs = useCallback(async () => {
        try {
            const allSongs = await getAllSongs();
            setSongs(allSongs);
            
            const inProgressSongs = allSongs.filter(s => 
                s.status !== GenerationStatus.COMPLETE && 
                s.status !== GenerationStatus.ERROR
            );
            
            pollingRef.current = new Set(inProgressSongs.map(s => s.id));

        } catch (e: any) {
            setError(e.message || "Failed to fetch songs.");
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSongs();
    }, [fetchSongs]);

    useEffect(() => {
        const intervalId = setInterval(async () => {
            if (pollingRef.current.size === 0) {
                return;
            }

            const idsToPoll = Array.from(pollingRef.current);

            for (const songId of idsToPoll) {
                try {
                    const updatedSong = await getSong(songId);
                    
                    setSongs(prevSongs => {
                        const index = prevSongs.findIndex(s => s.id === songId);
                         if (index === -1) {
                            return [updatedSong, ...prevSongs];
                        }
                        const newSongs = [...prevSongs];
                        // Only update if data is different to prevent unnecessary re-renders
                        if (JSON.stringify(newSongs[index]) !== JSON.stringify(updatedSong)) {
                           newSongs[index] = updatedSong;
                           return newSongs;
                        }
                        return prevSongs;
                    });

                    if (updatedSong.status === GenerationStatus.COMPLETE || updatedSong.status === GenerationStatus.ERROR) {
                        pollingRef.current.delete(songId);
                    }
                } catch (e) {
                    console.error(`Failed to poll song ${songId}:`, e);
                    pollingRef.current.delete(songId);
                }
            }
        }, 3000);

        return () => clearInterval(intervalId);
    }, []);

    const handleGenerate = async (prompt: string, customLyrics?: string, videoStyle?: string, difficulty?: Difficulty, advancedOptions?: AdvancedOptions) => {
        setIsGenerating(true);
        setError(null);
        try {
            const newSong = await generateSong(prompt, customLyrics, videoStyle, difficulty, advancedOptions);
            setSongs(prev => [newSong, ...prev]);
            pollingRef.current.add(newSong.id);
        } catch (e: any) {
            setError(e.message || "Failed to start song generation.");
        } finally {
            setIsGenerating(false);
        }
    };
    
    const handleRetry = async (songToRetry: Song) => {
        setError(null);
        try {
            const updatedSong = await retrySong(songToRetry);
            setSongs(prev => prev.map(s => s.id === updatedSong.id ? updatedSong : s));
            pollingRef.current.add(updatedSong.id);
        } catch (e: any) {
            setError(e.message || "Failed to retry song generation.");
        }
    };
    
    const handleRegenerateVideo = async (song: Song, videoStyle: string, difficulty: Difficulty) => {
        setError(null);
        try {
            const updatedSong = await regenerateVideo(song, videoStyle, difficulty);
            setSongs(prev => prev.map(s => s.id === updatedSong.id ? updatedSong : s));
            pollingRef.current.add(updatedSong.id);
        } catch (e: any) {
            setError(e.message || "Failed to regenerate video.");
        }
    };

    const handleUpdateSongDetails = (songId: string, updates: Partial<Song>) => {
        const updatedSong = { ...songs.find(s => s.id === songId)!, ...updates };
        setSongs(prev => prev.map(s => (s.id === songId ? updatedSong : s)));
        // In a real app, you would add an API call here:
        // await updateSongOnServer(songId, updates);
    };

    return (
        <div className="bg-gray-900 min-h-screen text-white font-sans">
            <header className="bg-gray-800/50 backdrop-blur-sm sticky top-0 z-20 border-b border-gray-700">
                <div className="container mx-auto px-6 py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <i className="fas fa-music text-3xl text-purple-400"></i>
                        <h1 className="text-2xl font-bold">Symphony AI</h1>
                    </div>
                </div>
            </header>

            {error && (
                <div className="container mx-auto mt-4 px-6">
                    <div className="bg-red-500/20 border border-red-500 text-red-300 px-4 py-3 rounded-md relative" role="alert">
                        <strong className="font-bold">Error: </strong>
                        <span className="block sm:inline">{error}</span>
                        <button onClick={() => setError(null)} className="absolute top-0 bottom-0 right-0 px-4 py-3" aria-label="Dismiss error">
                            <i className="fas fa-times"></i>
                        </button>
                    </div>
                </div>
            )}

            <main className="container mx-auto p-6 lg:p-8">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                    <div className="lg:col-span-1">
                        <CreateForm onGenerate={handleGenerate} isGenerating={isGenerating} />
                    </div>
                    <div className="lg:col-span-2">
                        <Library songs={songs} onSongSelect={(song) => setSelectedSongId(song.id)} onRetry={handleRetry} isLoading={isLoading} />
                    </div>
                </div>
            </main>

            {selectedSong && (
                <SongDetailModal 
                    song={selectedSong} 
                    onClose={() => setSelectedSongId(null)} 
                    onUpdate={handleUpdateSongDetails}
                    onRetry={handleRetry}
                    onRegenerateVideo={handleRegenerateVideo}
                />
            )}
        </div>
    );
};

export default App;