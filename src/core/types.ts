/** 멜론에서 읽어온 곡 한 곡 */
export interface MelonSong {
    songId: string;
    title: string;
    artist: string;
    album: string;
}

/** 멜론 곡 상세에서 추가로 읽는 정보 */
export interface MelonSongDetail {
    genre: string;
    releaseDate: string;
    album: string;
}

/** 멜론 마이뮤직의 플레이리스트 하나 */
export interface MelonPlaylist {
    seq: string;
    name: string;
    songCount: number;
}

/** 스크래핑 결과 전체 */
export interface ScrapedPlaylist {
    name: string;
    plylstSeq: string;
    total: number;
    scrapedAt: string;
    songs: MelonSong[];
}

/** 유튜브 뮤직 검색 결과 후보 */
export interface YtCandidate {
    videoId: string;
    title: string;
    artist: string;
    /** '노래' | '동영상' | '앨범' | 'EP' | '싱글' | '아티스트' ... */
    type: string;
    /** MUSIC_VIDEO_TYPE_ATV(공식 음원) | _OMV(뮤비) | _UGC(유저 업로드) */
    musicVideoType: string;
    subtitle: string;
    source: 'card' | 'list';
}

/** 점수가 매겨진 후보 */
export interface ScoredCandidate extends YtCandidate {
    score: number;
    titleSim: number;
    artistSim: number;
}

/** 곡 하나의 매칭 결과 */
export interface MatchRecord {
    index: number;
    melon: Pick<MelonSong, 'title' | 'artist'>;
    match: ScoredCandidate | null;
    error?: string;
}

/** 이어하기용 상태 */
export interface MigrationState {
    plylstSeq: string;
    playlistName: string;
    matches: MatchRecord[];
    playlistId: string | null;
    addedCount: number;
}

export type Mood = 'drive' | 'calm' | 'both';
export type MoodReason = 'song' | 'artist' | 'genre' | 'default';

export interface MoodVerdict {
    mood: Mood;
    by: MoodReason;
}

export interface MoodBuckets {
    pop: string[];
    drive: string[];
    calm: string[];
}
