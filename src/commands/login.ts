import { connect } from '../browser/chrome.js';
import { log } from '../core/logger.js';
import { autoDismissDialogs, gotoMelon, isLoggedIn } from '../melon/client.js';
import { YTM_ORIGIN } from '../ytmusic/innertube.js';

/**
 * 로그인 상태를 확인한다.
 *
 * 아이디/비밀번호는 프로그램이 절대 받지 않는다.
 * 구글은 자동화된 로그인을 차단하고 멜론/카카오는 2단계 인증을 요구하므로,
 * 로그인은 사람이 브라우저에서 직접 하고 프로그램은 그 세션에 붙기만 한다.
 */
export const loginCommand = async (): Promise<void> => {
    const session = await connect();
    autoDismissDialogs(session.page);

    await gotoMelon(session.page, '/');
    const melon = await isLoggedIn(session.page);

    await session.page.goto(YTM_ORIGIN, { waitUntil: 'domcontentloaded' });
    await session.page.waitForTimeout(3000);
    const ytmusic = await session.page.evaluate(() => {
        const data = (window as unknown as { ytcfg?: { data_?: Record<string, unknown> } }).ytcfg?.data_;
        return Boolean(data?.['LOGGED_IN']);
    });

    log.step('로그인 상태');
    log.info(`  멜론        ${melon ? '✓ 로그인됨' : '✗ 로그아웃'}`);
    log.info(`  유튜브 뮤직  ${ytmusic ? '✓ 로그인됨' : '✗ 로그아웃'}`);

    if (!melon || !ytmusic) {
        log.step('열려 있는 Chrome 창에서 직접 로그인해주세요.');
        if (!melon) log.info('  https://www.melon.com/  (멜론 또는 카카오 계정)');
        if (!ytmusic) log.info('  https://music.youtube.com/  (구글 계정, 2단계 인증 포함)');
        log.info('\n로그인 후 이 명령을 다시 실행해 확인하세요. 세션은 전용 프로필에 유지됩니다.');
    } else {
        log.info('\n준비 완료. `mtym playlists` 로 플레이리스트 목록을 확인하세요.');
    }

    await session.close();
};
