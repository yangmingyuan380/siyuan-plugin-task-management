export interface JiraConfig {
    jiraBaseUrl: string;
    jiraToken: string;
    jiraUsername: string; // JIRA用户名
    // 字段映射配置：思源数据库列名 -> JIRA字段路径
    fieldMappings: Record<string, string>;
    // 字段类型配置：思源数据库列名 -> 数据类型
    fieldTypes: Record<string, string>;
}

export interface LarkConfig {
    pluginId: string;
    pluginSecret: string;
    userKey: string;
    larkBaseUrl: string;
    spaceId: string;
    larkWorkLogUrl: string;
    authToken: string;
    projectKey: string;
    // 字段映射配置：思源数据库列名 -> 飞书字段路径
    fieldMappings: Record<string, string>;
    // 字段类型配置：思源数据库列名 -> 数据类型
    fieldTypes: Record<string, string>;
}

export interface LarkTokenCache {
    token: string;
    expireTime: number;
}

export interface WorkItemIdCache {
    issueKey: string;
    workItemTypeId: string;
    workItemEntityId: string;
    expireTime: number; // 过期时间戳（毫秒）
}

export interface Config {
    jiraConfig: JiraConfig;
    larkConfig: LarkConfig;
    logLevel: string; // 日志级别
    enableTimeTracking: boolean; // 是否启用工时记录
    syncToDailyNote: boolean; // 是否同步到日记
}

/**
 * 字段类型枚举
 */
export enum FieldType {
    TEXT = 'text',
    DATE = 'date',
    SELECT = 'select',
    URL = 'url'
} 

export * from './events';