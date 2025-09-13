
import React from 'react';
import type { Song } from '../types.ts';
import SongCard from './SongCard.tsx';

interface LibraryProps {
    songs: Song[];
    onSongSelect: (song: Song) => void;
    onRetry: (song: Song) => void;
    isLoading: boolean;
}

const SongCardSkeleton = () => (
    <div className="bg-gray-800 rounded-lg overflow-hidden shadow-lg animate-pulse">
        <div className="w-full h-48 bg-gray-700"></div>
        <div className="p-4">
            <div className="h-6 bg-gray-700 rounded w-3/4 mb-2"></div>
            <div className="h-4 bg-gray-700 rounded w-full"></div>
             <div className="mt-3 flex items-center gap-2">
                <div className="h-5 bg-gray-700 rounded-full w-20"></div>
                <div className="h-5 bg-gray-700 rounded-full w-24"></div>
            </div>
        </div>
    </div>
);


const Library: React.FC<LibraryProps> = ({ songs, onSongSelect, onRetry, isLoading }) => {
    if (isLoading) {
        return (
            <div>
                <h2 className="text-2xl font-semibold mb-4 text-white">My Creations</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                    {[...Array(8)].map((_, i) => <SongCardSkeleton key={i} />)}
                </div>
            </div>
        );
    }
    
    if (songs.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full bg-gray-800/50 rounded-lg p-8 border-2 border-dashed border-gray-700">
                <i className="fas fa-compact-disc text-5xl text-gray-500 mb-4 animate-spin-slow"></i>
                <h3 className="text-2xl font-semibold text-gray-300">Your Library is Empty</h3>
                <p className="text-gray-500 mt-2">Create a new song to see it here.</p>
            </div>
        );
    }

    return (
        <div>
            <h2 className="text-2xl font-semibold mb-4 text-white">My Creations</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {songs.map(song => (
                    <SongCard key={song.id} song={song} onSelect={() => onSongSelect(song)} onRetry={onRetry} />
                ))}
            </div>
        </div>
    );
};

export default Library;