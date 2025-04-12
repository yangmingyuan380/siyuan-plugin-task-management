import axios from 'axios';
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
     * 获取JIRA问题详情
     * @param issueKey JIRA问题ID
     * @returns 问题详情数据
     */
    public async fetchJiraIssue(issueKey: string): Promise<any> {
        if (!this.config.jiraBaseUrl || !this.config.jiraToken) {
            throw new Error('JIRA配置缺失');
        }

        try {
            // 准备认证信息
            const auth = this.config.jiraUsername ?
                { username: this.config.jiraUsername, password: this.config.jiraToken } :
                { username: 'apitoken', password: this.config.jiraToken };

            // 发送API请求
            const response = await axios.get(`${this.config.jiraBaseUrl}/rest/api/2/issue/${issueKey}`, {
                headers: {
                    'Content-Type': 'application/json',
                    // 使用Basic认证，将认证信息转为Base64
                    'Authorization': `Basic ${Buffer.from(`${auth.username}:${auth.password}`).toString('base64')}`,
                },
            });
            this.logger.debug('JIRA API响应', response);
            return response.data;
        } catch (error) {
            this.logger.error('JIRA API请求失败:', error);
            return null;
        }
    }
} 