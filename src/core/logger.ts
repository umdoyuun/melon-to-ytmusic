/* eslint-disable no-console */

let quiet = false;

export const setQuiet = (value: boolean): void => { quiet = value; };

export const log = {
    info(message: string): void {
        if (!quiet) console.log(message);
    },
    step(message: string): void {
        if (!quiet) console.log(`\n▸ ${message}`);
    },
    warn(message: string): void {
        console.warn(`  ! ${message}`);
    },
    error(message: string): void {
        console.error(`  ✗ ${message}`);
    },
    /** 같은 줄을 덮어쓰며 진행률을 표시한다. */
    progress(current: number, total: number, suffix = ''): void {
        if (quiet || !process.stdout.isTTY) {
            if (current === total || current % 100 === 0) {
                console.log(`  ${current}/${total} ${suffix}`.trimEnd());
            }
            return;
        }
        const pct = total > 0 ? Math.floor((current / total) * 100) : 0;
        process.stdout.write(`\r  ${current}/${total} (${pct}%) ${suffix}`.padEnd(70));
        if (current === total) process.stdout.write('\n');
    },
};
