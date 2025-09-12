
export enum Difficulty {
    EASY = "Easy",
    MEDIUM = "Medium",
    HARD = "Hard",
}

export enum GenerationStatus {
    GENERATING_LYRICS = "writing lyrics",
    GENERATING_AUDIO = "composing music",
    GENERATING_ART = "creating cover art",
    GENERATING_VIDEO = "directing video",
    POLLING_VIDEO = "rendering video",
    COMPLETE = "complete",
    ERROR = "error"
}

export type VocalGender = 'male' | 'female' | null;

export interface AdvancedOptions {
    excludeStyles: string;
    vocalGender: VocalGender;
    weirdness: number;
    styleInfluence: number;
}

export interface Song extends Partial<AdvancedOptions> {
    id: string;
    prompt: string;
    title: string;
    lyrics: string;
    coverArtUrl: string;
    audioUrl?: string;
    videoUrl?: string;
    status: GenerationStatus;
    statusMessage?: string;
    videoStyle?: string;
    difficulty?: Difficulty;
    failedStep?: GenerationStatus;
    createdAt: Date;
    thumbnailUrl?: string;
    genre?: string;
    tempo?: number;
    keySignature?: string;
    tags?: string;
}
