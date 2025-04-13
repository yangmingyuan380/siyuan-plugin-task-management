import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { LarkConfig } from '../types';
import { Logger } from '../utils';
import { ConfigManager } from '../conf';
import { LarkWorkLogService } from './larkWorkLogService';

export class LarkService {
    private config: LarkConfig;
    private logger: Logger;
    private configManager: ConfigManager;
    private larkWorkLogService: LarkWorkLogService;

    constructor(config: LarkConfig, logger: Logger, configManager: ConfigManager) {
        this.config = config;
        this.logger = logger;
        this.configManager = configManager;
        this.larkWorkLogService = new LarkWorkLogService(config, logger);
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
     * 获取飞书认证头信息
     * @returns 包含认证信息的headers对象
     */
    public async getLarkAuthHeader(): Promise<Record<string, string>> {
        const pluginToken = await this.getLarkToken();
        return {
            'X-PLUGIN-TOKEN': pluginToken,
            'X-USER-KEY': this.config.userKey,
            'Content-Type': 'application/json',
        };
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
            // 首先检查缓存
            const cache = this.configManager.getWorkItemCache(issueKey);
            if (cache) {
                this.logger.debug(`使用缓存获取工作项 ${issueKey}，类型ID: ${cache.workItemTypeId}`);
                
                // 使用缓存的workItemTypeId直接查询工作项详情
                const response = await this.request(
                    'post',
                    `${this.config.larkBaseUrl}/open_api/${this.config.spaceId}/work_item/${cache.workItemTypeId}/query`,
                    { work_item_ids: [issueKey] }
                );
                
                if (response.data && response.data.data && response.data.data.length > 0) {
                    const issueInfo = response.data.data[0];
                    // 确保工作项名称字段存在
                    if (issueInfo && !issueInfo.workItemEntityName) {
                        issueInfo.workItemEntityName = issueInfo.name || issueInfo.title || issueInfo.summary || `任务 ${issueKey}`;
                    }
                    this.logger.debug('使用缓存找到飞书工作项:', issueInfo);
                    return issueInfo;
                }
                
                // 如果使用缓存查询失败，清除缓存，走常规查询流程
                this.logger.warn(`缓存查询失败，将清除缓存并重新查询: ${issueKey}`);
                this.configManager.clearWorkItemCache(issueKey);
            }
            
            // 获取工作项类型列表
            const workItemListResponse = await this.request<any>(
                'get',
                `${this.config.larkBaseUrl}/open_api/${this.config.spaceId}/work_item/all-types`
            );

            if (!workItemListResponse.data || !workItemListResponse.data.data) {
                throw new Error('获取工作项类型列表失败: ' + JSON.stringify(workItemListResponse.data));
            }

            const workItemKeyList = workItemListResponse.data.data.map(item => item.type_key);
            this.logger.debug('获取到工作项类型:', workItemKeyList);

            // 逐个查询工作项类型，找到后立即返回
            for (const workItemKey of workItemKeyList) {
                try {
                    const response = await this.request(
                        'post',
                        `${this.config.larkBaseUrl}/open_api/${this.config.spaceId}/work_item/${workItemKey}/query`,
                        { work_item_ids: [issueKey] }
                    );
                    
                    if (response.data && response.data.data && response.data.data.length > 0) {
                        const issueInfo = response.data.data[0];
                        
                        // 确保工作项名称字段存在
                        if (issueInfo && !issueInfo.workItemEntityName) {
                            issueInfo.workItemEntityName = issueInfo.name || issueInfo.title || issueInfo.summary || `任务 ${issueKey}`;
                        }
                        
                        // 找到后异步缓存结果，但不等待完成
                        this.configManager.setWorkItemCache(
                            issueKey, 
                            workItemKey, 
                            issueInfo.id
                        ).catch(err => {
                            this.logger.warn(`缓存工作项信息失败: ${err.message}`);
                        });
                        
                        this.logger.debug(`在类型 ${workItemKey} 中找到飞书工作项:`, issueInfo);
                        return issueInfo;
                    }
                } catch (error) {
                    this.logger.warn(`在类型 ${workItemKey} 中查询工作项失败:`, error);
                    // 继续查询下一个类型
                }
            }
            
            // 所有类型都查询完毕，未找到工作项
            this.logger.warn('在所有工作项类型中均未找到该工作项:', issueKey);
            return null;
        } catch (error) {
            this.logger.error('获取飞书工作项失败:', error);
            return null;
        }
    }

    /**
     * 获取工作项的工时日志
     * @param issueKey 工作项ID
     * @returns 工时日志列表
     */
    public async fetchWorklog(issueKey: string): Promise<any> {
        try {
            // 首先获取工作项信息，确定工作项类型和实体ID
            const issueInfo = await this.fetchLarkIssue(issueKey);
            if (!issueInfo) {
                throw new Error(`未找到工作项: ${issueKey}`);
            }
            
            // 从工作项信息中获取类型ID和实体ID
            const workItemTypeId = issueInfo.work_item_type_key;
            const workItemEntityId = issueInfo.id;
            
            this.logger.debug(`获取飞书工时日志，工作项类型: ${workItemTypeId}, 实体ID: ${workItemEntityId}`);
            
            // 获取工时日志列表
            const worklogData = await this.larkWorkLogService.getLarkWorkLogListByWorkItemId(
                workItemTypeId, 
                workItemEntityId, 
                1, 
                100
            );
            
            const worklogCount = Array.isArray(worklogData) ? worklogData.length : 0;
            this.logger.debug(`获取到飞书工时日志列表，共 ${worklogCount} 条记录`);
            
            // 如果没有数据，返回空数组
            if (!worklogData || worklogCount === 0) {
                return { items: [] };
            }
            
            // 检查返回数据的格式，确保格式正确
            if (!Array.isArray(worklogData)) {
                this.logger.warn('飞书工时日志返回格式异常，预期数组但收到:', typeof worklogData);
                return { items: [] };
            }
            
            return {
                items: worklogData
            };
        } catch (error) {
            this.logger.error('获取飞书工时日志失败:', error);
            return { items: [] };
        }
    }
    
    /**
     * 添加工时日志
     * @param issueKey 工作项ID
     * @param timeEntry 工时条目
     * @returns 添加结果，包含新添加记录的ID
     */
    public async addWorklog(issueKey: string, timeEntry: any): Promise<any> {
        try {
            // 首先检查缓存，如果没有再获取工作项信息
            let workItemTypeId: string;
            let workItemEntityId: string;
            
            const cache = this.configManager.getWorkItemCache(issueKey);
            if (cache) {
                workItemTypeId = cache.workItemTypeId;
                workItemEntityId = cache.workItemEntityId;
                this.logger.debug(`使用缓存的工作项信息添加工时: ${issueKey}, 类型: ${workItemTypeId}`);
            } else {
                // 从API获取工作项信息
                const issueInfo = await this.fetchLarkIssue(issueKey);
                if (!issueInfo) {
                    throw new Error(`未找到工作项: ${issueKey}`);
                }
                
                // 从工作项信息中获取类型ID和实体ID
                workItemTypeId = issueInfo.work_item_type_key;
                workItemEntityId = issueInfo.id;
            }
            
            // 获取工作日期 (格式: YYYY-MM-DD)
            const workDate = new Date(timeEntry.startTime).toISOString().split('T')[0];
            
            // 获取工作时间（小时）
            const workTime = this.calculateWorkTimeFromTimeSpent(timeEntry.timeSpent);
            
            // 使用提供的节点ID，如果没有则获取一个可用的节点ID
            let nodeId = timeEntry.nodeId || '';
            if (!nodeId) {
                nodeId = await this.getNodeIdForWorkItem(workItemTypeId, workItemEntityId);
                this.logger.debug(`未提供节点ID，使用自动获取的节点: ${nodeId}`);
            } else {
                this.logger.debug(`使用提供的节点ID: ${nodeId}`);
            }
            
            // 检查描述内容
            const workDesc = timeEntry.description || '';
            if (!workDesc) {
                this.logger.warn('提交的工时记录没有描述内容');
            }
            
            // 添加工时日志
            const result = await this.larkWorkLogService.addLarkWorkLog(
                workItemTypeId,
                workItemEntityId,
                nodeId,
                workTime,
                workDesc,
                workDate
            );
            
            if (result.status === 200 && result.data && result.data.data) {
                // 解析返回结果获取新创建的记录ID
                let newRecordId = '';
                try {
                    // 通常API会在响应中返回新创建记录的ID
                    if (result.data.data.id) {
                        newRecordId = result.data.data.id;
                    } else if (result.data.data.workLogId) {
                        newRecordId = result.data.data.workLogId;
                    } else if (Array.isArray(result.data.data) && result.data.data.length > 0) {
                        // 如果返回的是数组，取第一个元素的ID
                        newRecordId = result.data.data[0].id || '';
                    }
                    
                    this.logger.debug(`成功添加飞书工时记录，ID: ${newRecordId}`);
                    
                    // 如果没有获取到ID，立即查询最新的工时记录
                    if (!newRecordId) {
                        this.logger.debug('响应中未包含新记录ID，尝试查询最近添加的记录');
                        
                        // 查询最新添加的工时记录
                        const recentLogs = await this.larkWorkLogService.getLarkWorkLogListByWorkItemId(
                            workItemTypeId,
                            workItemEntityId,
                            1,
                            10
                        );
                        
                        if (recentLogs && recentLogs.length > 0) {
                            // 找到与当前描述和时间匹配的记录
                            const matchedLog = recentLogs.find(log => 
                                log.description === workDesc && 
                                log.startTime.includes(workDate)
                            );
                            
                            if (matchedLog) {
                                newRecordId = matchedLog.id;
                                this.logger.debug(`通过查询找到新添加的记录ID: ${newRecordId}`);
                            }
                        }
                    }
                    
                    return {
                        success: true,
                        id: newRecordId
                    };
                } catch (parseError) {
                    this.logger.warn('解析新添加工时记录ID失败:', parseError);
                    return { success: true, id: '' };
                }
            }
            
            this.logger.warn(`添加飞书工时记录失败，状态码: ${result.status}`);
            return { success: false, id: '' };
        } catch (error) {
            this.logger.error('添加飞书工时日志失败:', error);
            throw error;
        }
    }
    
    /**
     * 删除工时日志
     * @param issueKey 工作项ID
     * @param worklogId 工时日志ID
     * @returns 删除结果
     */
    public async deleteWorklog(issueKey: string, worklogId: string): Promise<{success: boolean}> {
        try {
            // 从缓存中获取工作项信息，不需要重新查询
            const cache = this.configManager.getWorkItemCache(issueKey);
            if (!cache) {
                // 如果缓存没有，则获取工作项信息（这会建立缓存）
                const issueInfo = await this.fetchLarkIssue(issueKey);
                if (!issueInfo) {
                    throw new Error(`未找到工作项: ${issueKey}`);
                }
            }
            
            // 删除工时日志
            const result = await this.larkWorkLogService.deleteLarkWorkLog(worklogId);
            const success = result.status === 200;
            
            if (success) {
                this.logger.debug(`成功删除飞书工时记录 ID: ${worklogId}`);
            } else {
                this.logger.warn(`删除飞书工时记录失败，状态码: ${result.status}`);
            }
            
            return { success };
        } catch (error) {
            this.logger.error('删除飞书工时日志失败:', error);
            throw error;
        }
    }
    
    /**
     * 获取工作项的节点ID
     * @param workItemTypeId 工作项类型ID
     * @param workItemEntityId 工作项实体ID
     * @returns 节点ID
     */
    private async getNodeIdForWorkItem(workItemTypeId: string, workItemEntityId: string): Promise<string> {
        try {
            // 尝试获取工作项节点列表
            const worklogList = await this.larkWorkLogService.getLarkWorkLogListByWorkItemId(
                workItemTypeId, 
                workItemEntityId, 
                1, 
                1
            );
            
            // 如果有已存在的工时记录，使用其节点ID
            if (worklogList && worklogList.length > 0 && worklogList[0].nodeId) {
                const nodeId = worklogList[0].nodeId;
                this.logger.debug(`使用现有节点ID: ${nodeId}`);
                return nodeId;
            }
            
            // 没有找到节点ID，尝试获取所有可用节点
            const today = new Date().toISOString().split('T')[0];
            const nodeList = await this.getWorkItemNodes(workItemTypeId, workItemEntityId, today);
            
            if (nodeList && nodeList.length > 0) {
                const nodeId = nodeList[0].nodeId;
                this.logger.debug(`使用第一个可用节点ID: ${nodeId}`);
                return nodeId;
            }
            
            // 没有找到节点ID
            this.logger.debug(`未找到节点ID，将使用空值`);
            return '';
        } catch (error) {
            this.logger.warn('获取节点ID失败，将使用空值', error);
            return '';
        }
    }
    
    /**
     * 获取工作项的所有节点列表
     * @param workItemTypeId 工作项类型ID
     * @param workItemEntityId 工作项实体ID
     * @param workDate 工作日期，格式：YYYY-MM-DD
     * @returns 节点列表
     */
    public async getWorkItemNodes(workItemTypeId: string, workItemEntityId: string, workDate: string): Promise<any[]> {
        try {
            const nodeList = await this.larkWorkLogService.getWorkLogNodeList(
                workDate,
                workItemTypeId,
                workItemEntityId
            );
            
            if (!nodeList || !Array.isArray(nodeList)) {
                this.logger.warn(`未获取到有效的节点列表`);
                return [];
            }
            
            this.logger.debug(`获取到 ${nodeList.length} 个工作项节点`);
            return nodeList;
        } catch (error) {
            this.logger.error('获取工作项节点列表失败:', error);
            return [];
        }
    }
    
    /**
     * 将工时字符串转换为小时数
     * @param timeSpent 工时字符串，如 "1h 30m"
     * @returns 小时数，如 1.5
     */
    private calculateWorkTimeFromTimeSpent(timeSpent: string): number {
        if (!timeSpent) {
            return 1; // 默认1小时
        }
        
        const hoursMatch = timeSpent.match(/(\d+)h/);
        const minutesMatch = timeSpent.match(/(\d+)m/);
        let hours = 0;
        
        if (hoursMatch) {
            hours += parseInt(hoursMatch[1]);
        }
        
        if (minutesMatch) {
            hours += parseInt(minutesMatch[1]) / 60;
        }
        
        // 至少返回0.1小时
        return hours || 1;
    }
    
    /**
     * 封装的HTTP请求方法，自动添加认证头
     * @param method 请求方法
     * @param url 请求URL
     * @param data 请求数据
     * @param config 请求配置
     * @returns 请求响应
     */
    private async request<T = any>(
        method: 'get' | 'post' | 'put' | 'delete',
        url: string,
        data?: any,
        config?: AxiosRequestConfig
    ): Promise<AxiosResponse<T>> {
        const headers = await this.getLarkAuthHeader();
        const fullConfig: AxiosRequestConfig = {
            ...config,
            baseURL: config?.baseURL ?? this.config.larkBaseUrl,
            headers: {
                ...headers,
                ...(config?.headers || {})
            },
            url,
            method,
            data: method !== 'get' ? data : undefined,
            params: method === 'get' ? data : undefined
        };

        try {
            return await axios(fullConfig);
        } catch (error) {
            this.logger.error(`飞书API请求失败: ${url}`, error);
            throw error;
        }
    }

    /**
     * 更新工时日志
     * @param issueKey 工作项ID
     * @param worklogId 工时日志ID
     * @param timeEntry 工时条目
     * @returns 更新结果
     */
    public async updateWorklog(issueKey: string, worklogId: string, timeEntry: any): Promise<{success: boolean}> {
        try {
            // 首先检查缓存，如果没有再获取工作项信息
            let workItemTypeId: string;
            let workItemEntityId: string;
            
            const cache = this.configManager.getWorkItemCache(issueKey);
            if (cache) {
                workItemTypeId = cache.workItemTypeId;
                workItemEntityId = cache.workItemEntityId;
                this.logger.debug(`使用缓存的工作项信息更新工时: ${issueKey}, 类型: ${workItemTypeId}`);
            } else {
                // 从API获取工作项信息
                const issueInfo = await this.fetchLarkIssue(issueKey);
                if (!issueInfo) {
                    throw new Error(`未找到工作项: ${issueKey}`);
                }
                
                // 从工作项信息中获取类型ID和实体ID
                workItemTypeId = issueInfo.work_item_type_key;
                workItemEntityId = issueInfo.id;
            }
            
            // 获取工作日期 (格式: YYYY-MM-DD)
            const workDate = new Date(timeEntry.startTime).toISOString().split('T')[0];
            
            // 获取工作时间（小时）
            const workTime = this.calculateWorkTimeFromTimeSpent(timeEntry.timeSpent);
            
            // 使用提供的节点ID，如果没有则获取一个可用的节点ID
            let nodeId = timeEntry.nodeId || '';
            if (!nodeId) {
                nodeId = await this.getNodeIdForWorkItem(workItemTypeId, workItemEntityId);
                this.logger.debug(`未提供节点ID，使用自动获取的节点: ${nodeId}`);
            } else {
                this.logger.debug(`使用提供的节点ID: ${nodeId}`);
            }
            
            // 检查描述内容
            const workDesc = timeEntry.description || '';
            if (!workDesc) {
                this.logger.warn('提交的工时记录没有描述内容');
            }
            
            // 更新工时日志
            const result = await this.larkWorkLogService.updateLarkWorkLog(
                worklogId,
                workItemTypeId,
                workItemEntityId,
                nodeId,
                workTime,
                workDesc,
                workDate
            );
            
            const success = result.status === 200;
            if (success) {
                this.logger.debug(`成功更新飞书工时记录，ID: ${worklogId}, 工作项: ${issueKey}, 工时: ${workTime}小时, 描述: ${workDesc.substr(0, 30)}...`);
            } else {
                this.logger.warn(`更新飞书工时记录失败，状态码: ${result.status}`);
            }
            
            return { success };
        } catch (error) {
            this.logger.error('更新飞书工时日志失败:', error);
            throw error;
        }
    }

    /**
     * 获取指定日期的所有工时记录
     * @param date 日期字符串 (YYYY-MM-DD 格式) 或 Date 对象
     * @returns 工时记录列表
     */
    public async fetchWorklogByDate(date: string | Date): Promise<any> {
        try {
            const worklogData = await this.larkWorkLogService.getLarkWorkLogsByDate(date);
            
            if (!worklogData || worklogData.length === 0) {
                this.logger.debug('该日期没有工时记录');
                return { items: [] };
            }
            
            this.logger.debug(`获取到${typeof date === 'string' ? date : date.toISOString().split('T')[0]}的工时记录，共 ${worklogData.length} 条`);
            
            return {
                items: worklogData,
                date: typeof date === 'string' ? date : date.toISOString().split('T')[0]
            };
        } catch (error) {
            this.logger.error('获取日期工时记录失败:', error);
            return { items: [] };
        }
    }
}