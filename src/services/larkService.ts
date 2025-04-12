import axios from 'axios';
import { LarkConfig } from '../types';
import { Logger } from '../utils/logger';
import { ConfigManager } from '../conf/configManager';

export class LarkService {
    private config: LarkConfig;
    private logger: Logger;
    private configManager: ConfigManager;

    constructor(config: LarkConfig, logger: Logger, configManager: ConfigManager) {
        this.config = config;
        this.logger = logger;
        this.configManager = configManager;
    }

    /**
     * 获取飞书Token
     * @returns 访问令牌
     */
    private async getLarkToken(): Promise<string> {
        // 检查缓存中的token是否有效
        const currentTime = Date.now();
        const tokenCache = this.configManager.getLarkTokenCache();
        
        if (tokenCache && tokenCache.token && tokenCache.expireTime > currentTime) {
            // 使用缓存中的token
            this.logger.debug('使用缓存的飞书token');
            return tokenCache.token;
        }
        
        // 重新获取token
        this.logger.debug('重新获取飞书token');
        const pluginAccessToken = await axios.post(`${this.config.larkBaseUrl}/open_api/authen/plugin_token`, {
            'plugin_id': this.config.pluginId,
            'plugin_secret': this.config.pluginSecret,
            'type': 1,
        });

        // 检查响应
        if (!pluginAccessToken.data || !pluginAccessToken.data.data || !pluginAccessToken.data.data.token) {
            throw new Error('获取飞书token失败: ' + JSON.stringify(pluginAccessToken.data));
        }

        const token = pluginAccessToken.data.data.token;
        // 过期时间 = 当前时间 + 过期秒数 - 60秒安全边际
        const expireTime = currentTime + (pluginAccessToken.data.data.expire_time * 1000) - (60 * 1000);

        // 更新缓存
        await this.configManager.setLarkTokenCache({
            token: token,
            expireTime: expireTime,
        });

        this.logger.debug('更新飞书token缓存, 过期时间:', new Date(expireTime).toLocaleString());
        return token;
    }

    /**
     * 获取飞书问题详情
     * @param issueKey 问题ID
     * @returns 问题详情数据
     */
    public async fetchLarkIssue(issueKey: string): Promise<any> {
        if (!this.config || !this.config.pluginId || !this.config.pluginSecret) {
            throw new Error('飞书配置缺失');
        }

        try {
            // 获取token
            const pluginToken = await this.getLarkToken();
            
            const headers = {
                'X-PLUGIN-TOKEN': pluginToken,
                'X-USER-KEY': this.config.userKey,
                'Content-Type': 'application/json',
            }
            
            // 获取工作项类型列表
            const workItemListResponse = await axios.get(`${this.config.larkBaseUrl}/open_api/${this.config.spaceId}/work_item/all-types`, {
                headers,
            });

            if (!workItemListResponse.data || !workItemListResponse.data.data) {
                throw new Error('获取工作项类型列表失败: ' + JSON.stringify(workItemListResponse.data));
            }

            const workItemKeyList = workItemListResponse.data.data.map(item => item.type_key);
            this.logger.debug('获取到工作项类型:', workItemKeyList);

            // 查询工作项
            let issueInfo = null;
            for (const workItemKey of workItemKeyList) {
                try {
                    const response = await axios.post(`${this.config.larkBaseUrl}/open_api/${this.config.spaceId}/work_item/${workItemKey}/query`, {
                        work_item_ids: [issueKey],
                    }, {
                        headers,
                    });

                    if (response.data && response.data.data && response.data.data.length > 0) {
                        issueInfo = response.data.data[0];
                        this.logger.debug('找到飞书工作项:', issueInfo);
                        break;
                    }
                } catch (error) {
                    this.logger.warn(`在类型 ${workItemKey} 中查询工作项失败:`, error);
                    // 继续尝试下一个类型
                }
            }

            if (!issueInfo) {
                this.logger.warn('在所有工作项类型中均未找到该工作项:', issueKey);
                return null;
            }

            return issueInfo;
        } catch (error) {
            this.logger.error('获取飞书工作项失败:', error);
            return null;
        }
    }
} 