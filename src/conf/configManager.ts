import { Plugin, showMessage } from 'siyuan';
import { Config, JiraConfig, LarkConfig, LarkTokenCache, WorkItemIdCache } from '../types';
import { Logger } from '../utils';
import { ConfFileConstants } from '../consts';

/**
 * 配置管理器
 * 负责加载和保存插件配置
 */
export class ConfigManager {
    private plugin: Plugin;
    private logger: Logger;
    private config: Config;
    private optionColors: Record<string, Record<string, string>> = {};
    private fixedOptionColors: Record<string, Record<string, string>> = {};
    private larkTokenCache: LarkTokenCache | null = null;
    private workItemCache: Record<string, WorkItemIdCache> = {}; // 工作项ID缓存
    private workItemCacheKeys: string[] = []; // 缓存的key列表，用于LRU淘汰
    private readonly MAX_CACHE_SIZE = 100; // 最大缓存数量

    constructor(plugin: Plugin, logger: Logger) {
        this.plugin = plugin;
        this.logger = logger;
        // 初始化默认配置
        this.config = this.getDefaultConfig();
    }

    /**
     * 获取默认配置
     * @returns 默认配置对象
     */
    private getDefaultConfig(): Config {
        return {
            jiraConfig: {
                jiraBaseUrl: '',
                jiraToken: '',
                jiraUsername: '',
                fieldMappings: {
                    '状态': 'fields.status.name',
                    '优先级': 'fields.priority.name',
                    '经办人': 'fields.assignee.displayName',
                    '主题': 'fields.summary',
                    '更新时间': 'fields.updated',
                },
                fieldTypes: {
                    '状态': 'select',
                    '优先级': 'select',
                    '经办人': 'text',
                    '主题': 'text',
                    '更新时间': 'date',
                },
            },
            larkConfig: {
                pluginId: '',
                pluginSecret: '',
                userKey: '',
                larkBaseUrl: '',
                spaceId: '',
                larkWorkLogUrl: '',
                authToken: '',
                projectKey: '',
                fieldMappings: {
                    '状态': 'status.name',
                    '优先级': 'fields.filter(it=>it.field_key==="priority").field_value.label',
                    '经办人': 'fields.filter(it=>it.field_key==="assignee").field_value.label',
                    '主题': 'name',
                    '分类': 'fields.filter(it=>it.field_key==="category").field_value.label',
                    '工作项类型': 'type.display_name',
                    '更新时间': 'updated',
                },
                fieldTypes: {
                    '状态': 'select',
                    '优先级': 'select',
                    '经办人': 'text',
                    '主题': 'text',
                    '分类': 'select',
                    '工作项类型': 'select',
                    '更新时间': 'date',
                },
            },
            logLevel: 'info',
            enableTimeTracking: true,
            syncToDailyNote: false,
        };
    }

    /**
     * 加载所有配置
     */
    public async loadAllConfigs(): Promise<void> {
        await this.loadConfig();
        await this.loadOptionColors();
        await this.loadFixedOptionColors();
        await this.loadLarkTokenCache();
        await this.loadWorkItemCache(); // 加载工作项缓存
    }

    /**
     * 加载主配置
     */
    public async loadConfig(): Promise<void> {
        const config = await this.plugin.loadData(ConfFileConstants.MAIN);
        console.log('config', config);
        if (config) {
            this.config = config;
            this.logger.debug('加载配置成功:', this.config);
        } else {
            this.logger.warn('未找到配置文件，使用默认配置');
        }
    }

    /**
     * 加载选项颜色配置
     */
    public async loadOptionColors(): Promise<void> {
        const optionColors = await this.plugin.loadData(ConfFileConstants.OPTION_COLORS);
        if (optionColors) {
            this.optionColors = optionColors;
            this.logger.debug('加载选项颜色配置成功:', this.optionColors);
        } else {
            this.logger.debug('未找到选项颜色配置');
        }
    }

    /**
     * 加载固定选项颜色配置
     */
    public async loadFixedOptionColors(): Promise<void> {
        const fixedOptionColors = await this.plugin.loadData(ConfFileConstants.FIXED_OPTION_COLORS);
        if (fixedOptionColors) {
            this.fixedOptionColors = fixedOptionColors;
            this.logger.debug('加载固定选项颜色配置成功:', this.fixedOptionColors);
        } else {
            this.logger.debug('未找到固定选项颜色配置');
        }
    }

    /**
     * 加载飞书Token缓存
     */
    public async loadLarkTokenCache(): Promise<void> {
        const larkTokenCache = await this.plugin.loadData(ConfFileConstants.LARK_TOKEN_CACHE) as LarkTokenCache;
        if (larkTokenCache && larkTokenCache.token) {
            this.larkTokenCache = larkTokenCache;
            this.logger.debug('加载飞书Token缓存成功:', this.larkTokenCache);
        } else {
            this.logger.debug('未找到飞书Token缓存');
        }
    }

    /**
     * 加载工作项缓存
     */
    public async loadWorkItemCache(): Promise<void> {
        const workItemCache = await this.plugin.loadData('workItemCache');
        const workItemCacheKeys = await this.plugin.loadData('workItemCacheKeys');
        
        if (workItemCache && typeof workItemCache === 'object') {
            // 清理过期的缓存项
            const now = Date.now();
            const validCache: Record<string, WorkItemIdCache> = {};
            const validKeys: string[] = [];
            
            // 遍历缓存，只保留未过期的项
            Object.entries(workItemCache).forEach(([key, cache]) => {
                if (cache && typeof cache === 'object' && 'expireTime' in cache && (cache as any).expireTime > now) {
                    validCache[key] = cache as WorkItemIdCache;
                    validKeys.push(key);
                }
            });
            
            this.workItemCache = validCache;
            
            // 如果有缓存键序列，使用它，否则从有效缓存中重建
            if (Array.isArray(workItemCacheKeys)) {
                // 只保留有效的键
                this.workItemCacheKeys = workItemCacheKeys.filter(key => validCache[key]);
                
                // 添加可能遗漏的键
                validKeys.forEach(key => {
                    if (!this.workItemCacheKeys.includes(key)) {
                        this.workItemCacheKeys.push(key);
                    }
                });
            } else {
                this.workItemCacheKeys = validKeys;
            }
            
            this.logger.debug(`加载工作项缓存成功，有效项: ${this.workItemCacheKeys.length}`);
        } else {
            this.logger.debug('未找到工作项缓存或格式不正确');
            this.workItemCache = {};
            this.workItemCacheKeys = [];
        }
    }

    /**
     * 保存主配置
     */
    public async saveConfig(): Promise<void> {
        await this.plugin.saveData(ConfFileConstants.MAIN, this.config);
        this.logger.debug('保存配置成功');
    }

    /**
     * 保存选项颜色配置
     */
    public async saveOptionColors(): Promise<void> {
        await this.plugin.saveData(ConfFileConstants.OPTION_COLORS, this.optionColors);
        this.logger.debug('保存选项颜色配置成功');
    }

    /**
     * 保存固定选项颜色配置
     */
    public async saveFixedOptionColors(): Promise<void> {
        await this.plugin.saveData(ConfFileConstants.FIXED_OPTION_COLORS, this.fixedOptionColors);
        this.logger.debug('保存固定选项颜色配置成功');
    }

    /**
     * 保存飞书Token缓存
     */
    public async saveLarkTokenCache(): Promise<void> {
        await this.plugin.saveData(ConfFileConstants.LARK_TOKEN_CACHE, this.larkTokenCache);
        this.logger.debug('保存飞书Token缓存成功');
    }

    /**
     * 保存工作项缓存
     */
    public async saveWorkItemCache(): Promise<void> {
        await this.plugin.saveData('workItemCache', this.workItemCache);
        await this.plugin.saveData('workItemCacheKeys', this.workItemCacheKeys);
        this.logger.debug(`保存工作项缓存成功，共 ${this.workItemCacheKeys.length} 项`);
    }

    /**
     * 获取当前配置
     * @returns 当前配置
     */
    public getConfig(): Config {
        return this.config;
    }

    /**
     * 更新配置
     * @param config 新配置
     */
    public async updateConfig(config: Config): Promise<void> {
        this.config = config;
        await this.saveConfig();
        showMessage('配置已更新');
    }

    /**
     * 获取JIRA配置
     * @returns JIRA配置
     */
    public getJiraConfig(): JiraConfig {
        return this.config.jiraConfig;
    }

    /**
     * 获取飞书配置
     * @returns 飞书配置
     */
    public getLarkConfig(): LarkConfig {
        return this.config.larkConfig;
    }

    /**
     * 获取日志级别
     * @returns 日志级别
     */
    public getLogLevel(): string {
        return this.config.logLevel;
    }

    /**
     * 设置日志级别
     * @param level 日志级别
     */
    public setLogLevel(level: string): void {
        this.config.logLevel = level;
    }

    /**
     * 获取选项颜色配置
     * @returns 选项颜色配置
     */
    public getOptionColors(): Record<string, Record<string, string>> {
        return this.optionColors;
    }

    /**
     * 获取固定选项颜色配置
     * @returns 固定选项颜色配置
     */
    public getFixedOptionColors(): Record<string, Record<string, string>> {
        return this.fixedOptionColors;
    }

    /**
     * 设置固定选项颜色
     * @param fieldName 字段名称
     * @param optionColors 选项颜色映射
     */
    public async setFixedOptionColors(fieldName: string, optionColors: Record<string, string>): Promise<void> {
        // 初始化该字段的固定颜色映射
        if (!this.fixedOptionColors[fieldName]) {
            this.fixedOptionColors[fieldName] = {};
        }

        // 更新固定颜色映射
        this.fixedOptionColors[fieldName] = { ...optionColors };

        // 清除自动分配的颜色，使用固定颜色
        if (this.optionColors[fieldName]) {
            for (const option of Object.keys(this.optionColors[fieldName])) {
                if (this.fixedOptionColors[fieldName][option]) {
                    delete this.optionColors[fieldName][option];
                }
            }
        }

        // 保存配置
        await this.saveFixedOptionColors();
        await this.saveOptionColors();
    }

    /**
     * 获取飞书Token缓存
     * @returns 飞书Token缓存
     */
    public getLarkTokenCache(): LarkTokenCache | null {
        return this.larkTokenCache;
    }

    /**
     * 设置飞书Token缓存
     * @param cache 缓存数据
     */
    public async setLarkTokenCache(cache: LarkTokenCache): Promise<void> {
        this.larkTokenCache = cache;
        await this.saveLarkTokenCache();
    }

    /**
     * 获取工作项缓存
     * @param issueKey 工作项ID
     * @returns 工作项缓存信息
     */
    public getWorkItemCache(issueKey: string): WorkItemIdCache | null {
        const cache = this.workItemCache[issueKey];
        if (cache && cache.expireTime > Date.now()) {
            // 更新最近使用状态，将访问的key移到数组末尾表示最近使用
            this.updateCacheUsage(issueKey);
            return cache;
        }
        
        // 如果缓存过期，则删除
        if (cache) {
            this.logger.debug(`缓存已过期，清除: ${issueKey}`);
            delete this.workItemCache[issueKey];
            const index = this.workItemCacheKeys.indexOf(issueKey);
            if (index !== -1) {
                this.workItemCacheKeys.splice(index, 1);
            }
        }
        
        return null;
    }
    
    /**
     * 更新缓存使用状态（LRU策略）
     * @param issueKey 工作项ID
     */
    private updateCacheUsage(issueKey: string): void {
        // 先从列表中移除key
        const index = this.workItemCacheKeys.indexOf(issueKey);
        if (index !== -1) {
            this.workItemCacheKeys.splice(index, 1);
        }
        
        // 将key添加到列表末尾，表示最近使用
        this.workItemCacheKeys.push(issueKey);
    }
    
    /**
     * 设置工作项缓存
     * @param issueKey 工作项ID
     * @param workItemTypeId 工作项类型ID
     * @param workItemEntityId 工作项实体ID
     * @param ttl 缓存有效期（毫秒），默认24小时
     */
    public async setWorkItemCache(
        issueKey: string,
        workItemTypeId: string,
        workItemEntityId: string,
        ttl: number = 24 * 60 * 60 * 1000
    ): Promise<void> {
        // 检查是否需要淘汰缓存
        if (!(issueKey in this.workItemCache) && this.workItemCacheKeys.length >= this.MAX_CACHE_SIZE) {
            this.evictCache();
        }
        
        // 设置缓存
        this.workItemCache[issueKey] = {
            issueKey,
            workItemTypeId,
            workItemEntityId,
            expireTime: Date.now() + ttl
        };
        
        // 更新使用状态
        this.updateCacheUsage(issueKey);
        
        this.logger.debug(`缓存工作项信息: ${issueKey}, 类型ID: ${workItemTypeId}, 当前缓存项: ${this.workItemCacheKeys.length}`);
        
        // 持久化缓存数据
        await this.saveWorkItemCache();
    }
    
    /**
     * 淘汰最久未使用的缓存（LRU策略）
     */
    private evictCache(): void {
        if (this.workItemCacheKeys.length === 0) return;
        
        // 获取最久未使用的key（列表最前面的元素）
        const oldestKey = this.workItemCacheKeys.shift();
        if (oldestKey) {
            this.logger.debug(`缓存已满，淘汰最久未使用项: ${oldestKey}`);
            delete this.workItemCache[oldestKey];
        }
    }
    
    /**
     * 清除工作项缓存
     * @param issueKey 可选，指定要清除的工作项ID，如果不指定则清除所有
     */
    public clearWorkItemCache(issueKey?: string): void {
        if (issueKey) {
            delete this.workItemCache[issueKey];
            const index = this.workItemCacheKeys.indexOf(issueKey);
            if (index !== -1) {
                this.workItemCacheKeys.splice(index, 1);
            }
        } else {
            this.workItemCache = {};
            this.workItemCacheKeys = [];
        }
    }
} 