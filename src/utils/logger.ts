// 定义日志工具类
export class Logger {
    private level: string;
    private levelPriority: Record<string, number> = {
        'debug': 0,
        'info': 1,
        'warn': 2,
        'error': 3,
    };
    private prefix: string = 'syplugin-work-items';

    constructor(level: string = 'info') {
        this.level = level;
    }

    setLevel(level: string) {
        this.level = level;
    }

    debug(...args: any[]) {
        if (this.levelPriority[this.level] <= this.levelPriority['debug']) {
            console.debug(`[${this.prefix} - DEBUG]`, ...args);
        }
    }

    info(...args: any[]) {
        if (this.levelPriority[this.level] <= this.levelPriority['info']) {
            console.info(`[${this.prefix} - INFO]`, ...args);
        }
    }

    warn(...args: any[]) {
        if (this.levelPriority[this.level] <= this.levelPriority['warn']) {
            console.warn(`[${this.prefix} - WARN]`, ...args);
        }
    }

    error(...args: any[]) {
        if (this.levelPriority[this.level] <= this.levelPriority['error']) {
            console.error(`[${this.prefix} - ERROR]`, ...args);
        }
    }
} 