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
    // 字段映射配置：思源数据库列名 -> 飞书字段路径
    fieldMappings: Record<string, string>;
    // 字段类型配置：思源数据库列名 -> 数据类型
    fieldTypes: Record<string, string>;
}

export interface LarkTokenCache {
    token: string;
    expireTime: number;
}

export interface Config {
    jiraConfig: JiraConfig;
    larkConfig: LarkConfig;
    logLevel: string; // 日志级别
} 