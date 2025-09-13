
import React, { useState } from 'react';
import Loader from './Loader.tsx';
import { Difficulty, AdvancedOptions, VocalGender } from '../types.ts';

interface CreateFormProps {
    onGenerate: (prompt: string, customLyrics?: string, videoStyle?: string, difficulty?: Difficulty, advancedOptions?: AdvancedOptions) => void;
    isGenerating: boolean;
}

const videoStyles = ['Cinematic', 'Anime', 'Stop-motion', 'Vintage', 'Futuristic', 'Dreamy'];

// Reusable slider component tailored to the design in the prompt image
const CustomSlider = ({ label, value, onChange, tooltip }: { label: string; value: number; onChange: (v: number) => void; tooltip: string }) => {
    return (
        <div className="bg-gray-700 p-2 rounded-md flex items-center justify-between">
            <div className="flex items-center gap-2">
                <label className="text-sm font-medium text-gray-300 whitespace-nowrap">{label}</label>
                <div className="group relative flex items-center">
                    <i className="fas fa-info-circle text-gray-400 cursor-help" title={tooltip}></i>
                </div>
            </div>
            <div className="flex items-center flex-grow mx-4">
                <div className="relative w-full flex items-center h-6">
                    {/* Background vertical lines */}
                    <div className="absolute w-full flex justify-between items-center pointer-events-none">
                        {[...Array(11)].map((_, i) => (
                             <div key={i} className="h-4 w-px bg-gray-500"></div>
                        ))}
                    </div>
                    {/* Accessible range input slider */}
                    <input
                        type="range"
                        min="0"
                        max="100"
                        step="10"
                        value={value}
                        onChange={(e) => onChange(parseInt(e.target.value, 10))}
                        className="w-full h-1 appearance-none bg-transparent cursor-pointer absolute z-10 custom-slider"
                        aria-label={label}
                    />
                </div>
            </div>
            <span className="text-sm font-medium text-gray-300 w-8 text-right">{value}%</span>
        </div>
    );
};

const CreateForm: React.FC<CreateFormProps> = ({ onGenerate, isGenerating }) => {
    const [prompt, setPrompt] = useState('');
    const [useCustomLyrics, setUseCustomLyrics] = useState(false);
    const [customLyrics, setCustomLyrics] = useState('');
    const [videoStyle, setVideoStyle] = useState(videoStyles[0]);
    const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MEDIUM);
    
    // State for advanced options
    const [showAdvanced, setShowAdvanced] = useState(true); // Default to open as per the image
    const [excludeStyles, setExcludeStyles] = useState('');
    const [vocalGender, setVocalGender] = useState<VocalGender>(null);
    const [weirdness, setWeirdness] = useState(50);
    const [styleInfluence, setStyleInfluence] = useState(50);
    
    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (prompt.trim()) {
            const advancedOptions: AdvancedOptions = {
                excludeStyles,
                vocalGender,
                weirdness,
                styleInfluence
            };
            onGenerate(prompt, useCustomLyrics ? customLyrics : undefined, videoStyle, difficulty, advancedOptions);
        }
    };

    return (
        <div className="bg-gray-800 p-6 rounded-lg shadow-lg sticky top-8">
            <h2 className="text-xl font-semibold mb-4 text-white">Create a Song</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label htmlFor="prompt" className="block text-sm font-medium text-gray-300 mb-2">Song Description</label>
                    <textarea
                        id="prompt"
                        rows={4}
                        className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none transition"
                        placeholder="e.g., An epic synthwave track about a lone cyberpunk driving through a neon-lit city in the rain."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        disabled={isGenerating}
                    />
                </div>

                 <div>
                    <label htmlFor="videoStyle" className="block text-sm font-medium text-gray-300 mb-2">Video Style</label>
                    <select
                        id="videoStyle"
                        className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none transition"
                        value={videoStyle}
                        onChange={(e) => setVideoStyle(e.target.value)}
                        disabled={isGenerating}
                    >
                        {videoStyles.map(style => (
                            <option key={style} value={style}>{style}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">Difficulty</label>
                    <div className="flex justify-between space-x-2 bg-gray-700 p-1 rounded-md">
                        {Object.values(Difficulty).map((level) => (
                            <button
                                key={level}
                                type="button"
                                onClick={() => setDifficulty(level)}
                                className={`w-full text-center text-sm font-medium py-1.5 rounded-md transition-colors ${
                                    difficulty === level
                                        ? 'bg-purple-600 text-white shadow'
                                        : 'bg-transparent text-gray-300 hover:bg-gray-600'
                                }`}
                                disabled={isGenerating}
                                aria-pressed={difficulty === level}
                            >
                                {level}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Advanced Options Section */}
                <div className="border-t border-gray-700 pt-4">
                    <button 
                        type="button" 
                        onClick={() => setShowAdvanced(!showAdvanced)} 
                        className="w-full flex justify-between items-center text-left"
                        aria-expanded={showAdvanced}
                        aria-controls="advanced-options"
                    >
                        <div className="flex items-center gap-2">
                            <h3 className="font-semibold text-white">Advanced Options</h3>
                            <span className="bg-pink-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">NEW</span>
                        </div>
                        <i className={`fas fa-chevron-up transition-transform duration-200 ${!showAdvanced && 'rotate-180'}`}></i>
                    </button>
                    {showAdvanced && (
                        <div id="advanced-options" className="mt-4 space-y-3">
                            {/* Exclude Styles */}
                            <div className="relative">
                                <i className="fas fa-ban absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"></i>
                                <input
                                    type="text"
                                    placeholder="Exclude styles"
                                    className="w-full bg-gray-700 border border-gray-600 rounded-md py-2 pl-9 pr-3 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none transition"
                                    value={excludeStyles}
                                    onChange={(e) => setExcludeStyles(e.target.value)}
                                    disabled={isGenerating}
                                    aria-label="Exclude styles"
                                />
                            </div>

                            {/* Vocal Gender */}
                            <div className="flex items-center justify-between bg-gray-700 p-2 rounded-md">
                                <label className="text-sm font-medium text-gray-300">Vocal Gender</label>
                                <div className="flex items-center">
                                    <button type="button" onClick={() => setVocalGender('male')} className={`px-3 text-sm transition-colors ${vocalGender === 'male' ? 'text-white font-semibold' : 'text-gray-400 hover:text-white'}`}>Male</button>
                                    <button type="button" onClick={() => setVocalGender('female')} className={`px-3 text-sm transition-colors ${vocalGender === 'female' ? 'text-white font-semibold' : 'text-gray-400 hover:text-white'}`}>Female</button>
                                </div>
                            </div>
                            
                            {/* Weirdness Slider */}
                            <CustomSlider
                                label="Weirdness"
                                value={weirdness}
                                onChange={setWeirdness}
                                tooltip="Controls how unusual or experimental the result is. Higher values lead to more abstract results."
                            />
                            
                            {/* Style Influence Slider */}
                            <CustomSlider
                                label="Style Influence"
                                value={styleInfluence}
                                onChange={setStyleInfluence}
                                tooltip="How strongly the chosen style and prompt influences the output versus the lyrics."
                            />
                        </div>
                    )}
                </div>

                <div className="pt-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                        <input
                            type="checkbox"
                            className="h-4 w-4 rounded bg-gray-700 border-gray-600 text-purple-600 focus:ring-purple-500"
                            checked={useCustomLyrics}
                            onChange={() => setUseCustomLyrics(!useCustomLyrics)}
                            disabled={isGenerating}
                        />
                        <span className="text-sm text-gray-300">Use Custom Lyrics</span>
                    </label>
                </div>

                {useCustomLyrics && (
                    <div>
                        <label htmlFor="customLyrics" className="block text-sm font-medium text-gray-300 mb-2">Your Lyrics</label>
                        <textarea
                            id="customLyrics"
                            rows={6}
                            className="w-full bg-gray-700 border border-gray-600 rounded-md p-2 text-white focus:ring-2 focus:ring-purple-500 focus:outline-none transition"
                            placeholder="[Verse 1]..."
                            value={customLyrics}
                            onChange={(e) => setCustomLyrics(e.target.value)}
                            disabled={isGenerating}
                        />
                    </div>
                )}
                
                <button
                    type="submit"
                    disabled={isGenerating || !prompt.trim()}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-md disabled:bg-gray-500 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center"
                >
                    {isGenerating ? (
                        <>
                           <Loader /> Generating...
                        </>
                    ) : (
                        <><i className="fas fa-magic mr-2"></i>Generate</>
                    )}
                </button>
            </form>
        </div>
    );
};

export default CreateForm;