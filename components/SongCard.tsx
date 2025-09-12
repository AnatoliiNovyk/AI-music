
import React from 'react';
import type { Song } from '../types.ts';
import { GenerationStatus } from '../types.ts';
import Loader from './Loader.tsx';

interface SongCardProps {
    song: Song;
    onSelect: () => void;
    onRetry: (song: Song) => void;
}

const StatusIndicator: React.FC<{ status: GenerationStatus, message?: string, onRetry: () => void }> = ({ status, message, onRetry }) => {
    if (status === GenerationStatus.COMPLETE) return null;
    
    let iconClass = "fas fa-spinner animate-spin";
    let text = message || `Status: ${status}`;
    
    if (status === GenerationStatus.ERROR) {
        iconClass = "fas fa-exclamation-triangle text-red-400";
        text = message || "Generation Failed";
        return (
             <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center p-2 text-center z-10 space-y-3">
                <i className={`${iconClass} text-2xl`}></i>
                <span className="text-xs font-semibold capitalize break-words">{text}</span>
                <button 
                    onClick={(e) => { e.stopPropagation(); onRetry(); }} 
                    className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 px-3 rounded-md text-sm transition-all"
                    aria-label="Retry song generation"
                >
                    <i className="fas fa-sync-alt mr-2"></i>Retry
                </button>
            </div>
        );
    }

    return (
        <div className="absolute inset-0 bg-black/70 flex flex-col items-center justify-center p-2 text-center z-10">
            <i className={`${iconClass} mb-2 text-2xl`}></i>
            <span className="text-xs font-semibold capitalize">{text}</span>
        </div>
    );
};

const GeneratingPlaceholder = () => (
    <div className="w-full h-48 bg-gray-700 flex items-center justify-center space-x-1.5" aria-label="Generating content placeholder">
        <div className="sound-bar" style={{ animationDelay: '0s' }}></div>
        <div className="sound-bar" style={{ animationDelay: '0.1s' }}></div>
        <div className="sound-bar" style={{ animationDelay: '0.2s' }}></div>
        <div className="sound-bar" style={{ animationDelay: '0.3s' }}></div>
        <div className="sound-bar" style={{ animationDelay: '0.4s' }}></div>
    </div>
);

const ErrorPlaceholder = () => (
     <div className="w-full h-48 bg-gray-700 flex items-center justify-center" aria-label="Error placeholder">
        <i className="fas fa-compact-disc text-gray-500 text-6xl opacity-50"></i>
    </div>
);


const SongCard: React.FC<SongCardProps> = ({ song, onSelect, onRetry }) => {
    const isComplete = song.status === GenerationStatus.COMPLETE;
    const isError = song.status === GenerationStatus.ERROR;
    const canBeSelected = isComplete || isError;
    const hasMetadata = song.genre || song.tempo;


    return (
        <div 
            className={`group relative bg-gray-800 rounded-lg overflow-hidden shadow-lg transition-transform duration-300 ${isComplete ? 'hover:scale-105 hover:shadow-purple-500/30' : ''} ${canBeSelected ? 'cursor-pointer' : 'cursor-wait'}`}
            onClick={canBeSelected ? onSelect : undefined}
            aria-busy={!canBeSelected}
        >
            <StatusIndicator status={song.status} message={song.statusMessage} onRetry={() => onRetry(song)} />

            {isComplete ? (
                <img src={song.coverArtUrl} alt={`Cover for ${song.title}`} className="w-full h-48 object-cover" />
            ) : (
                isError ? <ErrorPlaceholder /> : <GeneratingPlaceholder />
            )}
            
            <div className="p-4">
                <h3 className="font-bold text-lg truncate text-white">{song.title}</h3>
                <p className="text-sm text-gray-400 truncate">{song.prompt}</p>
                {hasMetadata && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        {song.genre && (
                            <span className="flex items-center gap-1.5 bg-purple-500/20 text-purple-300 text-xs px-2 py-0.5 rounded-full">
                                <i className="fas fa-guitar fa-fw text-purple-400"></i>
                                <span>{song.genre}</span>
                            </span>
                        )}
                        {song.tempo && (
                            <span className="flex items-center gap-1.5 bg-teal-500/20 text-teal-300 text-xs px-2 py-0.5 rounded-full">
                                <i className="fas fa-stopwatch fa-fw text-teal-400"></i>
                                <span>{song.tempo} BPM</span>
                            </span>
                        )}
                    </div>
                )}
            </div>
             {isComplete && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300" aria-hidden="true">
                    <i className="fas fa-play-circle text-5xl text-white"></i>
                </div>
            )}
        </div>
    );
};

export default SongCard;