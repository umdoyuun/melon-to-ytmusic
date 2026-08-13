#!/usr/bin/env node
import { Command } from 'commander';
import { getDataDir, setDataDir } from './config.js';
import { log } from './core/logger.js';
import { loginCommand } from './commands/login.js';
import { migrateCommand } from './commands/migrate.js';
import { moodsCommand } from './commands/moods.js';
import { repairCommand } from './commands/repair.js';
import { playlistsCommand, scrapeCommand } from './commands/scrape.js';

const program = new Command();

program
    .name('mtym')
    .description('멜론 플레이리스트를 유튜브 뮤직으로 옮기고, 무드별로 나눠 담습니다.')
    .version('1.0.0')
    .option('--data-dir <path>', '결과물을 저장할 디렉터리 (기본: ./data)')
    .hook('preAction', (command) => {
        const dir = command.opts()['dataDir'] as string | undefined;
        if (dir) setDataDir(dir);
    });

program
    .command('where')
    .description('결과물이 저장되는 위치를 보여줍니다')
    .action(() => { log.info(getDataDir()); });

program
    .command('login')
    .description('Chrome을 열고 멜론/유튜브 뮤직 로그인 상태를 확인합니다')
    .action(loginCommand);

program
    .command('playlists')
    .description('멜론 마이뮤직의 플레이리스트 목록을 봅니다')
    .action(playlistsCommand);

program
    .command('scrape')
    .description('멜론 플레이리스트의 곡 목록을 수집합니다')
    .requiredOption('-p, --playlist <seq>', '플레이리스트 번호 (mtym playlists 로 확인)')
    .option('--genres', '곡별 장르도 함께 수집합니다 (무드 분류에 필요)', false)
    .action(scrapeCommand);

program
    .command('migrate')
    .description('수집한 곡을 유튜브 뮤직에서 찾아 새 플레이리스트로 옮깁니다')
    .action(migrateCommand);

program
    .command('repair')
    .description('앨범/EP로 잘못 매칭된 곡을 다시 찾아 교정합니다')
    .option('--apply', '실제로 반영합니다 (기본은 미리보기)', false)
    .action(repairCommand);

program
    .command('moods')
    .description('팝송 / 드라이브 / 잔잔 세 플레이리스트로 나눠 담습니다')
    .option('--dry-run', '분류 결과만 보고 플레이리스트는 만들지 않습니다', false)
    .option('--recreate', '기존 무드 플레이리스트를 지우고 다시 만듭니다', false)
    .action(moodsCommand);

program.parseAsync(process.argv).catch((error: unknown) => {
    log.error((error as Error).message);
    process.exitCode = 1;
});
