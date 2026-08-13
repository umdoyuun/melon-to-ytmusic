import { findAll, type Innertube } from './innertube.js';

export const playlistUrl = (playlistId: string): string =>
    `https://music.youtube.com/playlist?list=${playlistId}`;

/** 비공개 플레이리스트를 만든다. */
export const createPlaylist = async (
    client: Innertube,
    title: string,
    description = '',
): Promise<string> => {
    const json = await client.call<{ playlistId?: string }>('playlist/create', {
        title,
        description,
        privacyStatus: 'PRIVATE',
    });

    if (!json.playlistId) {
        throw new Error(`플레이리스트 생성 실패: ${JSON.stringify(json).slice(0, 300)}`);
    }
    return json.playlistId;
};

export const deletePlaylist = async (client: Innertube, playlistId: string): Promise<void> => {
    await client.call('playlist/delete', { playlistId });
};

/** 곡을 추가한다. 한 번에 여러 곡을 넣을 수 있다. */
export const addToPlaylist = async (
    client: Innertube,
    playlistId: string,
    videoIds: string[],
): Promise<void> => {
    if (videoIds.length === 0) return;

    const json = await client.call<{ status?: string }>('browse/edit_playlist', {
        playlistId,
        actions: videoIds.map(videoId => ({ action: 'ACTION_ADD_VIDEO', addedVideoId: videoId })),
    });

    if (json.status && json.status !== 'STATUS_SUCCEEDED') {
        throw new Error(`곡 추가 실패: ${JSON.stringify(json).slice(0, 300)}`);
    }
};

/** 곡을 제거한다. 제거에는 videoId 말고 setVideoId(플레이리스트 내 항목 ID)도 필요하다. */
export const removeFromPlaylist = async (
    client: Innertube,
    playlistId: string,
    items: Array<{ videoId: string; setVideoId: string }>,
): Promise<void> => {
    if (items.length === 0) return;

    await client.call('browse/edit_playlist', {
        playlistId,
        actions: items.map(({ videoId, setVideoId }) => ({
            action: 'ACTION_REMOVE_VIDEO',
            removedVideoId: videoId,
            setVideoId,
        })),
    });
};

/**
 * 플레이리스트에 들어있는 videoId -> setVideoId 매핑.
 * 곡을 교체하거나 지우려면 이 값이 필요하다.
 */
export const getPlaylistItems = async (
    client: Innertube,
    playlistId: string,
): Promise<Map<string, string>> => {
    const items = new Map<string, string>();
    let json = await client.call<Record<string, unknown>>('browse', { browseId: `VL${playlistId}` });

    for (let page = 0; page < 60; page++) {
        for (const data of findAll(json, 'playlistItemData')) {
            const { videoId, setVideoId } = data as { videoId?: string; setVideoId?: string };
            if (videoId && setVideoId && !items.has(videoId)) items.set(videoId, setVideoId);
        }

        const continuation = findAll(json, 'continuationCommand')[0] as { token?: string } | undefined;
        if (!continuation?.token) break;

        json = await client.call<Record<string, unknown>>('browse', { continuation: continuation.token });
    }

    return items;
};
