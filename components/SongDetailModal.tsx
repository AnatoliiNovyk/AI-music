import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { Song } from '../types.ts';
import { GenerationStatus, Difficulty } from '../types.ts';
import Loader from './Loader.tsx';

interface SongDetailModalProps {
    song: Song;
    onClose: () => void;
    onUpdate: (songId: string, updates: Partial<Pick<Song, 'title' | 'lyrics' | 'videoUrl' | 'thumbnailUrl' | 'audioUrl' | 'genre' | 'tempo' | 'keySignature' | 'tags'>>) => void;
    onRetry: (song: Song) => void;
    onRegenerateVideo: (song: Song, videoStyle: string, difficulty: Difficulty) => void;
}

const videoStyles = ['Cinematic', 'Anime', 'Stop-motion', 'Vintage', 'Futuristic', 'Dreamy'];

// Helper component for loading overlays
const LoadingOverlay = ({ text, message }: { text: string; message?: string }) => (
    <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 text-center z-30 animate-fade-in" aria-live="polite">
        <i className="fas fa-spinner animate-spin text-5xl text-white mb-4"></i>
        <h3 className="text-lg font-semibold text-white">{text}</h3>
        {message && <p className="text-sm text-gray-300 mt-1">{message}</p>}
    </div>
);

// Helper component for displaying metadata
const DetailItem = ({ label, value, icon, fullWidth = false }: { label: string; value: React.ReactNode; icon: string; fullWidth?: boolean }) => (
    <div className={fullWidth ? 'col-span-2 sm:col-span-3' : ''}>
        <div className="text-xs text-gray-400 font-semibold uppercase flex items-center gap-2"><i className={`fas ${icon} fa-fw`}></i>{label}</div>
        <div className="text-white font-medium mt-1">{value}</div>
    </div>
);


const SongDetailModal: React.FC<SongDetailModalProps> = ({ song, onClose, onUpdate, onRetry, onRegenerateVideo }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedTitle, setEditedTitle] = useState(song.title);
    const [showShareOptions, setShowShareOptions] = useState(false);
    const [copyButtonText, setCopyButtonText] = useState("Copy Link");
    const [showRegenerateOptions, setShowRegenerateOptions] = useState(false);
    const [newVideoStyle, setNewVideoStyle] = useState(song.videoStyle || 'Cinematic');
    const [newDifficulty, setNewDifficulty] = useState<Difficulty>(song.difficulty || Difficulty.MEDIUM);

    // Loading states for uploads
    const [isUploadingVideo, setIsUploadingVideo] = useState(false);
    const [isUploadingAudio, setIsUploadingAudio] = useState(false);
    const [audioUploadSuccess, setAudioUploadSuccess] = useState(false);

    // New state for editable metadata
    const [editedGenre, setEditedGenre] = useState(song.genre || '');
    const [editedTempo, setEditedTempo] = useState<number | ''>(song.tempo || '');
    const [editedKeySignature, setEditedKeySignature] = useState(song.keySignature || '');
    const [editedTags, setEditedTags] = useState(song.tags || '');


    // Undo/Redo state for lyrics (now supports HTML)
    const [editedLyrics, setEditedLyrics] = useState(song.lyrics);
    const lyricsHistory = useRef<string[]>([song.lyrics]);
    const historyIndex = useRef<number>(0);
    const isNavigatingHistory = useRef<boolean>(false);
    const [canUndo, setCanUndo] = useState(false);
    const [canRedo, setCanRedo] = useState(false);
    const editorRef = useRef<HTMLDivElement>(null);


    const videoRef = useRef<HTMLVideoElement>(null);
    const audioRef = useRef<HTMLAudioElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        setEditedTitle(song.title);
        setEditedLyrics(song.lyrics);
        setIsEditing(false); 
        setShowShareOptions(false);
        setShowRegenerateOptions(false);
        setNewVideoStyle(song.videoStyle || 'Cinematic');
        setNewDifficulty(song.difficulty || Difficulty.MEDIUM);
        // Reset undo/redo state
        lyricsHistory.current = [song.lyrics];
        historyIndex.current = 0;
        setCanUndo(false);
        setCanRedo(false);
        // Reset new metadata fields
        setEditedGenre(song.genre || '');
        setEditedTempo(song.tempo || '');
        setEditedKeySignature(song.keySignature || '');
        setEditedTags(song.tags || '');
    }, [song]);

    // Debounced effect to save history for undo/redo
    useEffect(() => {
        if (isNavigatingHistory.current) {
            isNavigatingHistory.current = false;
            return;
        }
        const handler = setTimeout(() => {
            if (editedLyrics !== lyricsHistory.current[historyIndex.current]) {
                const newHistory = lyricsHistory.current.slice(0, historyIndex.current + 1);
                newHistory.push(editedLyrics);
                lyricsHistory.current = newHistory;
                historyIndex.current = newHistory.length - 1;

                setCanUndo(true);
                setCanRedo(false);
            }
        }, 500); // 500ms debounce
        return () => clearTimeout(handler);
    }, [editedLyrics]);

    const handleUndo = useCallback(() => {
        if (historyIndex.current > 0) {
            isNavigatingHistory.current = true;
            const newIndex = historyIndex.current - 1;
            historyIndex.current = newIndex;
            setEditedLyrics(lyricsHistory.current[newIndex]);
            setCanUndo(newIndex > 0);
            setCanRedo(true);
        }
    }, []);

    const handleRedo = useCallback(() => {
        if (historyIndex.current < lyricsHistory.current.length - 1) {
            isNavigatingHistory.current = true;
            const newIndex = historyIndex.current + 1;
            historyIndex.current = newIndex;
            setEditedLyrics(lyricsHistory.current[newIndex]);
            setCanUndo(true);
            setCanRedo(newIndex < lyricsHistory.current.length - 1);
        }
    }, []);

    const handleFormatLyrics = () => {
        const editor = editorRef.current;
        if (!editor) return;

        const text = editor.innerText;
        const newHtml = text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/(\[.*?\])/g, '<strong class="text-purple-400">$1</strong>')
            .replace(/(\(.*?\))/g, '<em class="text-teal-400">$1</em>')
            .replace(/\n/g, '<br>');

        setEditedLyrics(newHtml);
        if (editorRef.current) editorRef.current.innerHTML = newHtml;
    };

    // Keyboard shortcuts for lyrics editor
    useEffect(() => {
        const editor = editorRef.current;
        if (!editor || !isEditing) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey)) {
                switch (e.key) {
                    case 'z':
                        e.preventDefault();
                        if (e.shiftKey) { handleRedo(); } else { handleUndo(); }
                        break;
                    case 'y':
                        e.preventDefault();
                        handleRedo();
                        break;
                    case 'b':
                        e.preventDefault();
                        document.execCommand('bold');
                        break;
                    case 'i':
                        e.preventDefault();
                        document.execCommand('italic');
                        break;
                }
            }
        };
        editor.addEventListener('keydown', handleKeyDown);
        return () => editor.removeEventListener('keydown', handleKeyDown);
    }, [isEditing, handleUndo, handleRedo]);


    // Effect for syncing video and audio playback
    useEffect(() => {
        const video = videoRef.current;
        const audio = audioRef.current;
        if (!video || !audio) return;

        // Ensure the video element's own audio is muted to prevent echo.
        video.muted = true;

        // --- Synchronization Logic ---
        // The video element acts as the "master" clock. All playback events (play, pause, seek)
        // on the video will control the "slave" audio element to keep them in sync.

        // Defines the maximum allowed time difference (in seconds) before forcing a resync.
        const SYNC_THRESHOLD = 0.2;

        const handleVideoPlay = () => {
            // Before playing the audio, check if it has drifted from the video's time.
            if (Math.abs(video.currentTime - audio.currentTime) > SYNC_THRESHOLD) {
                audio.currentTime = video.currentTime;
            }
            audio.play().catch(e => console.error("Audio play failed:", e));
        };

        const handleVideoPause = () => audio.pause();
        const handleVideoWaiting = () => audio.pause();
        const handleVideoPlaying = () => handleVideoPlay();

        const handleVideoSeeking = () => {
            audio.pause();
            audio.currentTime = video.currentTime;
        };

        const handleVideoSeeked = () => {
            if (!video.paused) {
                handleVideoPlay();
            }
        };

        const handleVideoRateChange = () => {
            audio.playbackRate = video.playbackRate;
        };

        // Attach event listeners to the master video element
        video.addEventListener('play', handleVideoPlay);
        video.addEventListener('pause', handleVideoPause);
        video.addEventListener('waiting', handleVideoWaiting);
        video.addEventListener('playing', handleVideoPlaying);
        video.addEventListener('seeking', handleVideoSeeking);
        video.addEventListener('seeked', handleVideoSeeked);
        video.addEventListener('ratechange', handleVideoRateChange);

        // Cleanup: remove all listeners when the component unmounts or dependencies change
        return () => {
            video.removeEventListener('play', handleVideoPlay);
            video.removeEventListener('pause', handleVideoPause);
            video.removeEventListener('waiting', handleVideoWaiting);
            video.removeEventListener('playing', handleVideoPlaying);
            video.removeEventListener('seeking', handleVideoSeeking);
            video.removeEventListener('seeked', handleVideoSeeked);
            video.removeEventListener('ratechange', handleVideoRateChange);
        };
    }, [song.videoUrl, song.audioUrl]);


    // Effect for Audio Visualizer
    useEffect(() => {
        const video = videoRef.current;
        const audio = audioRef.current;
        const canvas = canvasRef.current;
        if (!song.videoUrl || !video || !audio || !canvas) return;
        
        const audioVisualizer = {
            context: null as AudioContext | null,
            analyser: null as AnalyserNode | null,
            source: null as MediaElementAudioSourceNode | null,
            animationId: null as number | null,
        };

        const draw = () => {
            if (!canvas || !audioVisualizer.analyser || !audioVisualizer.context || audioVisualizer.context.state === 'suspended') return;
            
            audioVisualizer.animationId = requestAnimationFrame(draw);
            const analyser = audioVisualizer.analyser;
            const bufferLength = analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            analyser.getByteFrequencyData(dataArray);

            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            
            const barWidth = canvas.width / bufferLength;
            let maxVal = 0;
            let maxIndex = 0;
            for (let i = 0; i < bufferLength; i++) {
                if (dataArray[i] > maxVal) { maxVal = dataArray[i]; maxIndex = i; }
            }
            for (let i = 0; i < bufferLength; i++) {
                const normalizedHeight = dataArray[i] / 255;
                const barHeight = Math.pow(normalizedHeight, 2.2) * canvas.height;
                const y = canvas.height - barHeight;
                const hue = 210;
                const saturation = (i === maxIndex) ? 100 : 70;
                const lightness = 50 + (normalizedHeight * 20);
                ctx.fillStyle = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                ctx.fillRect(i * barWidth, y, barWidth, barHeight);
            }
        };
        
        const setupAudio = () => {
             if (audioVisualizer.context) {
                audioVisualizer.context.close();
            }
            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            const context = new AudioContext();
            audioVisualizer.context = context;
            if (context.state === 'suspended') { context.resume(); }

            try {
                if (!audioVisualizer.source) { audioVisualizer.source = context.createMediaElementSource(audio); }
                const analyser = context.createAnalyser();
                analyser.fftSize = 256;
                audioVisualizer.analyser = analyser;
                audioVisualizer.source.connect(analyser).connect(context.destination);
                draw();
            } catch (e) { console.error("Error setting up audio visualizer:", e); }
        };
        
        const cleanup = () => {
            if (audioVisualizer.animationId) cancelAnimationFrame(audioVisualizer.animationId);
            if (audioVisualizer.context) audioVisualizer.context.close().catch(console.error);
            if (audioVisualizer.source) audioVisualizer.source.disconnect();
        };
        
        video.addEventListener('play', setupAudio);
        video.addEventListener('pause', cleanup);

        return cleanup;
    }, [song.videoUrl, song.audioUrl]);

    const handleSave = () => {
        onUpdate(song.id, { 
            title: editedTitle, 
            lyrics: editedLyrics,
            genre: editedGenre || undefined,
            tempo: editedTempo === '' ? undefined : Number(editedTempo),
            keySignature: editedKeySignature || undefined,
            tags: editedTags.trim() || undefined,
        });
        setIsEditing(false);
    };

    const handleCancel = () => {
        setEditedTitle(song.title);
        setEditedLyrics(song.lyrics);
        if (editorRef.current) editorRef.current.innerHTML = song.lyrics;
        setEditedGenre(song.genre || '');
        setEditedTempo(song.tempo || '');
        setEditedKeySignature(song.keySignature || '');
        setEditedTags(song.tags || '');
        setIsEditing(false);
    };

    const handleCopyLink = () => {
        const url = `${window.location.origin}/song/${song.id}`;
        navigator.clipboard.writeText(url).then(() => {
            setCopyButtonText("Copied!");
            setTimeout(() => setCopyButtonText("Copy Link"), 2000);
        });
    };

    const handleFileUpload = (file: File | null, type: 'video' | 'audio') => {
        if (!file) return;

        if (type === 'video') {
            setIsUploadingVideo(true);
            // Simulate upload
            setTimeout(() => {
                const fileUrl = URL.createObjectURL(file);
                onUpdate(song.id, { videoUrl: fileUrl });
                setIsUploadingVideo(false);
            }, 2000);
        } else if (type === 'audio') {
            setIsUploadingAudio(true);
            setAudioUploadSuccess(false); // Reset on new upload
            // Simulate upload
            setTimeout(() => {
                const fileUrl = URL.createObjectURL(file);
                onUpdate(song.id, { audioUrl: fileUrl });
                setIsUploadingAudio(false);
                setAudioUploadSuccess(true);
                // Hide success message after 3 seconds
                setTimeout(() => setAudioUploadSuccess(false), 3000);
            }, 2000);
        }
    };

    const handleRegenerate = () => {
        onRegenerateVideo(song, newVideoStyle, newDifficulty);
        setShowRegenerateOptions(false);
    };
    
    return (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="bg-gray-800 rounded-xl shadow-2xl w-full max-w-6xl h-full max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
                
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    {isEditing ? (
                        <input id="modal-title-input" type="text" value={editedTitle} onChange={e => setEditedTitle(e.target.value)} className="text-2xl font-bold bg-gray-700 text-white rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-purple-500 w-full" />
                    ) : (
                        <h2 id="modal-title" className="text-2xl font-bold text-white truncate">{song.title}</h2>
                    )}
                    <div className="flex items-center gap-2">
                        {isEditing ? (
                            <>
                                <button onClick={handleSave} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md transition-colors"><i className="fas fa-save mr-2"></i>Save</button>
                                <button onClick={handleCancel} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-colors">Cancel</button>
                            </>
                        ) : (
                            <button onClick={() => setIsEditing(true)} className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded-md transition-colors"><i className="fas fa-pencil-alt mr-2"></i>Edit</button>
                        )}
                        <button onClick={onClose} className="text-gray-400 hover:text-white text-2xl w-8 h-8 flex items-center justify-center" aria-label="Close modal">&times;</button>
                    </div>
                </header>

                <div className="flex-grow flex flex-col md:flex-row overflow-y-auto min-h-0">
                    <div className="w-full md:w-1/2 flex-shrink-0 relative bg-black">
                        {song.status === GenerationStatus.GENERATING_VIDEO && <LoadingOverlay text="Directing Video" message={song.statusMessage} />}
                        {song.status === GenerationStatus.ERROR && (
                            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-4 text-center z-20">
                                <i className="fas fa-exclamation-triangle text-red-400 text-4xl mb-3"></i>
                                <h3 className="text-lg font-semibold text-white">Video Generation Failed</h3>
                                <p className="text-sm text-gray-300 mt-1 mb-4">{song.statusMessage}</p>
                                <button onClick={() => onRetry(song)} className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded-md"><i className="fas fa-sync-alt mr-2"></i>Retry</button>
                            </div>
                        )}
                        {isUploadingVideo && <LoadingOverlay text="Uploading Video..." />}

                        {song.videoUrl ? (
                            <>
                                <div className="relative w-full h-full">
                                    <video ref={videoRef} src={song.videoUrl} controls className="w-full h-full object-contain" />
                                    <canvas ref={canvasRef} className="absolute bottom-0 left-0 w-full h-1/4 pointer-events-none opacity-70" />
                                </div>
                                <div className="absolute top-2 left-2 z-10">
                                    <label className="bg-black/50 text-white text-xs px-2 py-1 rounded-md hover:bg-purple-600 cursor-pointer">
                                        <i className="fas fa-video mr-1"></i> Upload Video
                                        <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'video')} />
                                    </label>
                                </div>
                            </>
                        ) : (
                            <div className="w-full h-full flex items-center justify-center">
                                <img src={song.coverArtUrl} alt="Cover Art" className="w-full h-full object-contain opacity-30" />
                                <div className="absolute">
                                    <label className="flex flex-col items-center gap-3 bg-black/60 text-white p-8 rounded-xl hover:bg-purple-600/80 cursor-pointer transition-all border-2 border-dashed border-gray-500 hover:border-purple-400">
                                        <i className="fas fa-upload text-4xl"></i>
                                        <span className="font-semibold text-lg">Upload Video</span>
                                        <input type="file" accept="video/*" className="hidden" onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'video')} />
                                    </label>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="w-full md:w-1/2 flex flex-col p-4 overflow-y-auto">
                        <div className="mb-4 flex-shrink-0">
                            {isUploadingAudio ? (
                                <div className="w-full h-12 bg-gray-900 rounded-lg flex items-center justify-center gap-2 text-gray-300">
                                    <Loader /> 
                                    <span>Uploading audio...</span>
                                </div>
                            ) : song.audioUrl ? (
                                <audio ref={audioRef} src={song.audioUrl} className="w-full h-12" controls />
                            ) : (
                                <div className="w-full h-12 bg-gray-900/50 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-600 hover:border-purple-500 transition-colors">
                                    <label className="flex items-center gap-2 text-sm text-gray-300 hover:text-white cursor-pointer w-full h-full justify-center">
                                        <i className="fas fa-upload"></i>
                                        <span>Upload Audio File</span>
                                        <input
                                            type="file"
                                            accept="audio/*"
                                            className="hidden"
                                            onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'audio')}
                                        />
                                    </label>
                                </div>
                            )}
                            <div className="mt-4 p-4 bg-gray-900 rounded-lg">
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
                                    <DetailItem label="Genre" value={isEditing ? <input type="text" value={editedGenre} onChange={e => setEditedGenre(e.target.value)} className="bg-gray-700 rounded px-1 py-0.5 w-full text-white" /> : (song.genre || 'N/A')} icon="fa-guitar" />
                                    <DetailItem 
                                        label="Tempo (BPM)" 
                                        icon="fa-stopwatch" 
                                        value={
                                            isEditing ? (
                                                <div className="flex items-center gap-2 w-full">
                                                    <input 
                                                        type="range" 
                                                        min="40" 
                                                        max="220" 
                                                        value={Number(editedTempo) || 120}
                                                        onChange={e => setEditedTempo(Number(e.target.value))} 
                                                        className="flex-grow h-2 bg-gray-600 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                                        aria-label="Tempo slider"
                                                    />
                                                    <input
                                                        type="number"
                                                        min="40"
                                                        max="220"
                                                        value={editedTempo}
                                                        onChange={e => setEditedTempo(e.target.value === '' ? '' : Number(e.target.value))}
                                                        className="bg-gray-900 rounded px-1 py-0.5 w-16 text-white text-center"
                                                        aria-label="Tempo input"
                                                    />
                                                </div>
                                            ) : (song.tempo || 'N/A')
                                        } 
                                    />
                                    <DetailItem label="Key" value={isEditing ? <input type="text" value={editedKeySignature} onChange={e => setEditedKeySignature(e.target.value)} className="bg-gray-700 rounded px-1 py-0.5 w-full text-white" /> : (song.keySignature || 'N/A')} icon="fa-key" />
                                    <DetailItem label="Difficulty" value={song.difficulty || 'N/A'} icon="fa-sliders-h" />
                                    <DetailItem label="Video Style" value={song.videoStyle || 'N/A'} icon="fa-film" />
                                    <DetailItem label="Created" value={new Date(song.createdAt).toLocaleDateString()} icon="fa-calendar-alt" />
                                    <DetailItem 
                                        label="Tags"
                                        icon="fa-tags"
                                        fullWidth={true}
                                        value={isEditing ? 
                                            <input type="text" value={editedTags} onChange={e => setEditedTags(e.target.value)} placeholder="synthwave, 80s, retro" className="bg-gray-700 rounded px-1 py-0.5 w-full text-white" /> 
                                            : 
                                            (
                                                song.tags ? (
                                                <div className="flex flex-wrap gap-2">
                                                    {song.tags.split(',').map(tag => tag.trim()).filter(Boolean).map((tag, index) => (
                                                        <span key={index} className="bg-purple-500/20 text-purple-300 text-xs font-medium px-2.5 py-1 rounded-full">{tag}</span>
                                                    ))}
                                                </div>
                                                ) : 'N/A'
                                            )
                                        } 
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex-grow flex flex-col min-h-0">
                             <div className="flex items-center justify-between mb-2">
                                <h3 className="text-lg font-semibold text-white">Lyrics</h3>
                            </div>
                            {isEditing && (
                                <div className="flex items-center gap-1 bg-gray-900 p-1 rounded-t-md border-b-2 border-gray-700">
                                    <button onClick={handleUndo} disabled={!canUndo} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Undo"><i className="fas fa-undo"></i></button>
                                    <button onClick={handleRedo} disabled={!canRedo} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:bg-gray-700 rounded disabled:opacity-50 disabled:cursor-not-allowed" aria-label="Redo"><i className="fas fa-redo"></i></button>
                                    <div className="w-px h-5 bg-gray-700 mx-1"></div>
                                    <button onClick={() => document.execCommand('bold')} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:bg-gray-700 rounded" aria-label="Bold"><i className="fas fa-bold"></i></button>
                                    <button onClick={() => document.execCommand('italic')} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:bg-gray-700 rounded" aria-label="Italic"><i className="fas fa-italic"></i></button>
                                    <div className="w-px h-5 bg-gray-700 mx-1"></div>
                                    <button onClick={handleFormatLyrics} className="w-8 h-8 flex items-center justify-center text-gray-300 hover:bg-gray-700 rounded" aria-label="Auto-format lyrics" title="Auto-format lyrics"><i className="fas fa-magic"></i></button>
                                </div>
                            )}
                            <div 
                                ref={editorRef}
                                contentEditable={isEditing}
                                onInput={e => setEditedLyrics(e.currentTarget.innerHTML)}
                                dangerouslySetInnerHTML={{ __html: editedLyrics }}
                                className={`flex-grow p-4 overflow-y-auto whitespace-pre-wrap break-words text-gray-300 ${isEditing ? 'bg-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500 rounded-b-md' : 'bg-gray-900/50 rounded-md'}`}
                            />
                        </div>
                    </div>
                </div>

                <footer className="flex items-center justify-between p-3 border-t border-gray-700 flex-shrink-0 bg-gray-900/50">
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <button onClick={() => setShowRegenerateOptions(!showRegenerateOptions)} className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-md transition-colors">
                                <i className="fas fa-sync-alt"></i> Regenerate Video
                            </button>
                             {showRegenerateOptions && (
                                <div className="absolute bottom-full left-0 mb-2 w-72 bg-gray-700 rounded-lg p-3 shadow-lg z-10 space-y-3">
                                    <h4 className="font-semibold text-sm">Regenerate Options</h4>
                                    <div>
                                        <label htmlFor="regen-style" className="block text-xs text-gray-400 mb-1">Video Style</label>
                                        <select id="regen-style" value={newVideoStyle} onChange={(e) => setNewVideoStyle(e.target.value)} className="w-full bg-gray-600 text-white text-sm rounded p-1 border-0">
                                            {videoStyles.map(style => <option key={style} value={style}>{style}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs text-gray-400 mb-1">Difficulty</label>
                                        <div className="flex justify-between space-x-1 bg-gray-600 p-1 rounded-md">
                                             {Object.values(Difficulty).map((level) => (
                                                <button key={level} type="button" onClick={() => setNewDifficulty(level)} className={`w-full text-center text-xs py-1 rounded ${newDifficulty === level ? 'bg-purple-600' : 'hover:bg-gray-500'}`}>
                                                    {level}
                                                </button>
                                             ))}
                                        </div>
                                    </div>
                                    <button onClick={handleRegenerate} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-1.5 px-3 rounded-md text-sm transition-all">
                                        Apply & Regenerate
                                    </button>
                                </div>
                            )}
                        </div>
                        <div className="relative flex items-center justify-center" style={{ minWidth: '160px' }}>
                            {isUploadingAudio ? (
                                <div className="flex items-center gap-2 text-sm text-gray-300 px-3 py-1.5">
                                    <Loader />
                                    <span>Uploading...</span>
                                </div>
                            ) : audioUploadSuccess ? (
                                <div className="flex items-center gap-2 text-sm text-green-400 px-3 py-1.5">
                                    <i className="fas fa-check-circle"></i>
                                    <span>Upload Complete!</span>
                                </div>
                            ) : (
                                <label className="flex items-center gap-2 text-sm bg-gray-700 hover:bg-gray-600 px-3 py-1.5 rounded-md transition-colors cursor-pointer">
                                    <i className={`fas ${song.audioUrl ? 'fa-exchange-alt' : 'fa-music'}`}></i> {song.audioUrl ? 'Replace Audio' : 'Upload Audio'}
                                    <input 
                                        type="file" 
                                        accept="audio/*" 
                                        className="hidden" 
                                        onChange={(e) => handleFileUpload(e.target.files?.[0] || null, 'audio')} 
                                        disabled={isUploadingAudio}
                                    />
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <button onClick={() => setShowShareOptions(!showShareOptions)} className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-1.5 px-3 rounded-md text-sm transition-colors flex items-center gap-2">
                                <i className="fas fa-share-alt"></i> Share
                            </button>
                            {showShareOptions && (
                                <div className="absolute bottom-full right-0 mb-2 w-64 bg-gray-700 rounded-lg p-3 shadow-lg z-10">
                                    <p className="text-sm font-semibold mb-2">Share this creation</p>
                                    <div className="flex">
                                        <input type="text" readOnly value={`${window.location.origin}/song/${song.id}`} className="flex-grow bg-gray-600 text-gray-300 text-sm rounded-l-md px-2 border-0" />
                                        <button onClick={handleCopyLink} className="bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold py-1 px-3 rounded-r-md">{copyButtonText}</button>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </footer>
            </div>
        </div>
    );
};

export default SongDetailModal;