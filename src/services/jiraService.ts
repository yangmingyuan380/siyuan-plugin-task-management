import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';
import { JiraConfig } from '../types';
import { Logger } from '../utils/logger';

export class JiraService {
    private config: JiraConfig;
    private logger: Logger;

    constructor(config: JiraConfig, logger: Logger) {
        this.config = config;
        this.logger = logger;
    }

    /**
     * 获取JIRA认证头信息
     * @returns 包含认证信息的headers对象
     */
    private getJiraAuthHeader(): Record<string, string> {
        if (!this.config.jiraBaseUrl || !this.config.jiraToken) {
            throw new Error('JIRA配置缺失');
        }

        // 准备认证信息
        const auth = this.config.jiraUsername
            ? { username: this.config.jiraUsername, password: this.config.jiraToken }
            : { username: 'apitoken', password: this.config.jiraToken };

        // 使用Basic认证，将认证信息转为Base64
        const authBase64 = Buffer.from(`${auth.username}:${auth.password}`).toString('base64');

        return {
            'Content-Type': 'application/json',
            'Authorization': `Basic ${authBase64}`
        };
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
        const headers = this.getJiraAuthHeader();
        const fullConfig: AxiosRequestConfig = {
            ...config,
            headers: {
                ...headers,
                ...(config?.headers || {})
            },
            url,
            method,
            data: method !== 'get' ? data : undefined,
            params: method === 'get' ? data : undefined
        };

        // 修正合并顺序，确保自定义头优先级更高
        if (config?.headers) {
            fullConfig.headers = {
                ...headers,  // 基础认证头部
                ...config.headers  // 自定义头部（优先）
            };
        }

        try {
            const response = await axios(fullConfig);
            this.logger.debug(`JIRA API请求成功: ${url}`, response.status);
            return response;
        } catch (error) {
            this.logger.error(`JIRA API请求失败: ${url}`, error);
            throw error;
        }
    }

    /**
     * 获取JIRA问题详情
     * @param issueKey JIRA问题ID
     * @returns 问题详情数据
     */
    public async fetchJiraIssue(issueKey: string): Promise<any> {
        try {
            const response = await this.request<any>(
                'get',
                `${this.config.jiraBaseUrl}/rest/api/2/issue/${issueKey}`
            );
            return response.data;
        } catch (error) {
            this.logger.error('获取JIRA问题详情失败:', error);
            return null;
        }
    }

    /**
     * 获取JIRA工作日志
     * @param issueKey JIRA问题ID
     * @returns 工作日志数据
     */
    public async fetchWorklog(issueKey: string): Promise<any> {
        try {
            const response = await this.request<any>(
                'get',
                `${this.config.jiraBaseUrl}/rest/api/2/issue/${issueKey}/worklog`
            );
            return response.data;
        } catch (error) {
            this.logger.error('获取JIRA工作日志失败:', error);
            throw error;
        }
    }

    /**
     * 添加JIRA工作日志
     * @param issueKey JIRA问题ID
     * @param worklog 工作日志数据
     * @returns 添加结果，包含新添加记录的ID
     */
    public async addWorklog(issueKey: string, worklog: any): Promise<any> {
        try {
            // 计算开始时间
            const startTime = new Date(worklog.startTime).toISOString().replace('Z', '+0000');
            
            const payload = {
                comment: worklog.description,
                started: startTime,
                timeSpent: worklog.timeSpent
            };

            const response = await this.request<any>(
                'post',
                `${this.config.jiraBaseUrl}/rest/api/2/issue/${issueKey}/worklog`,
                payload
            );

            if (response.status === 201 && response.data) {
                // JIRA API通常会在响应中返回新创建的工作日志对象
                const newWorklogId = response.data.id || '';
                this.logger.debug(`成功添加JIRA工作日志，ID: ${newWorklogId}`);
                
                return {
                    success: true,
                    id: newWorklogId
                };
            }

            this.logger.warn(`添加JIRA工作日志失败，状态码: ${response.status}`);
            return { success: false, id: '' };
        } catch (error) {
            this.logger.error('添加JIRA工作日志失败:', error);
            throw error;
        }
    }

    /**
     * 删除JIRA工作日志
     * @param issueKey JIRA问题ID
     * @param worklogId 工作日志ID
     * @returns 删除结果
     */
    public async deleteWorklog(issueKey: string, worklogId: string): Promise<{success: boolean}> {
        try {
            const response = await this.request<any>(
                'delete',
                `${this.config.jiraBaseUrl}/rest/api/2/issue/${issueKey}/worklog/${worklogId}`
            );
            
            return { success: response.status === 204 };
        } catch (error) {
            this.logger.error('删除JIRA工作日志失败:', error);
            throw error;
        }
    }

    /**
     * 更新JIRA工作日志
     * @param issueKey JIRA问题ID
     * @param worklogId 工作日志ID
     * @param worklog 工作日志数据
     * @returns 更新结果
     */
    public async updateWorklog(issueKey: string, worklogId: string, worklog: any): Promise<{success: boolean}> {
        try {
            // 计算开始时间
            const startTime = new Date(worklog.startTime).toISOString().replace('Z', '+0000');
            
            const payload = {
                comment: worklog.description,
                started: startTime,
                timeSpent: worklog.timeSpent
            };

            const response = await this.request<any>(
                'put',
                `${this.config.jiraBaseUrl}/rest/api/2/issue/${issueKey}/worklog/${worklogId}`,
                payload
            );

            return { success: response.status === 200 };
        } catch (error) {
            this.logger.error('更新JIRA工作日志失败:', error);
            throw error;
        }
    }
} 