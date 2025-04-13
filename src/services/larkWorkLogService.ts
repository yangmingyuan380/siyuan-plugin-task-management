import { Logger } from '../utils';
import { LarkConfig } from '../types';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

export class LarkWorkLogService {
    private config: LarkConfig;
    private logger: Logger;

    constructor(config: LarkConfig, logger: Logger) {
        this.config = config;
        this.logger = logger;
    }

    /**
     * 获取飞书认证头信息
     * @returns 包含认证信息的headers对象
     */
    public async getLarkAuthHeader(): Promise<Record<string, string>> {
        return {
            'Project-Key': this.config.projectKey,
            'Authorization': this.config.authToken,
            'Content-Type': 'application/json',
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
        config?: AxiosRequestConfig,
    ): Promise<AxiosResponse<T>> {
        const headers = await this.getLarkAuthHeader();
        const fullConfig: AxiosRequestConfig = {
            ...config,
            baseURL: config?.baseURL ?? this.config.larkWorkLogUrl,
            headers: {
                ...headers,
                ...(config?.headers || {}),
            },
            url,
            method,
            data: method !== 'get' ? data : undefined,
            params: method === 'get' ? data : undefined,
        };

        try {
            return await axios(fullConfig);
        } catch (error) {
            this.logger.error(`飞书API请求失败: ${ url }`, error);
            throw error;
        }
    }

    /**
     * 获取个人所有飞书工作日志列表
     * @param page 当前页码
     * @param pageSize 每页条数
     * @returns 工作日志列表
     */
    public async getLarkWorkLogList(page: number, pageSize: number): Promise<any> {
        const res = await this.request('post', '/workHour/queryNodeWorkHour', {
            'startDate': '2025-01-01 00:00:00',
            'endDate': new Date().toISOString().split('T')[0] + ' 23:59:59',
            'pageNo': page,
            'pageSize': pageSize,
            'statisticType': 1,
            'userIdList': [],
        });
        return res.data.data;
    }

    /**
     * 获取指定工作项所有飞书工作日志列表
     * @param workItemTypeId 工作项类型id
     * @param workItemEntityId 工作项id
     * @param page 当前页码
     * @param pageSize 每页条数
     * @returns 工作日志列表
     */
    public async getLarkWorkLogListByWorkItemId(workItemTypeId: string, workItemEntityId: string, page: number, pageSize: number): Promise<any> {
        try {
            // 构建查询参数
            const queryParams = {
                workItemId: workItemTypeId,
                workItemEntityId: workItemEntityId,
                pageNum: page,
                pageSize: pageSize,
                nodeId: '',
                taskId: '',
                startTime: '',
                endTime: '',
                userId: '',
            };

            // 使用URLSearchParams构建查询字符串
            const searchParams = new URLSearchParams();
            for (const [key, value] of Object.entries(queryParams)) {
                searchParams.append(key, String(value));
            }

            // 执行请求
            const res = await this.request('get', `/entityInstance/selectNodeUserList?${ searchParams.toString() }`);

            // 提取并处理数据
            const workLogListAndCount = res.data.data;
            if (!workLogListAndCount || !workLogListAndCount.data) {
                this.logger.warn('未获取到有效的工时日志数据');
                return [];
            }

            // 过滤并转换返回的数据
            return workLogListAndCount.data
                .filter((workLog: any) => workLog.status === 'activated')
                .map((workLog: any) => this.formatWorkLog(workLog, 'registeredWorkTimeTask'));
        } catch (error) {
            this.logger.error('获取飞书工时日志列表失败:', error);
            throw error;
        }
    }

    /**
     * 格式化工作日志对象
     * @param workLog 原始工作日志数据
     * @param workTimeKey 工时 key
     * @returns 格式化后的工作日志对象
     */
    private formatWorkLog(workLog: any, workTimeKey: string): any {
        // 处理飞书返回的工时格式："3.00小时 (0.38人天)"
        let timeSpent = '';
        if (workLog[workTimeKey]) {
            // 尝试从字符串中提取小时数
            const hourMatch = workLog[workTimeKey].match(/([\d.]+)小时/);
            if (hourMatch && hourMatch[1]) {
                const hours = parseFloat(hourMatch[1]);
                // 转换为 "Xh" 格式
                timeSpent = this.formatHoursToTimeSpent(hours);
            } else {
                // 如果无法解析，直接使用原始值
                timeSpent = workLog[workTimeKey];
            }
        } else if (workLog.actWorkHour) {
            // 如果有小时数，直接格式化
            timeSpent = this.formatHoursToTimeSpent(workLog.actWorkHour);
        }

        return {
            id: workLog.id,
            workItemId: workLog.workItemId,
            workItemEntityId: workLog.workItemEntityId,
            nodeId: workLog.nodeId,
            nodeName: workLog.nodeName,
            description: workLog.workDesc,
            startTime: workLog.workDate,
            avatar: workLog.avatarUrl,
            author: workLog.userName,
            timeSpent: timeSpent || '0h',
            rawTimeSpent: workLog[workTimeKey], // 保留原始时间格式，方便调试
            workItemEntityName: workLog.workItemEntityName || workLog.workItemName || '未知任务',
        };
    }

    /**
     * 将小时数格式化为 "Xh Ym" 格式
     * @param hours 小时数
     * @returns 格式化后的时间字符串
     */
    private formatHoursToTimeSpent(hours: number): string {
        if (!hours || isNaN(hours)) {
            return '0h';
        }

        // 计算小时和分钟
        const wholeHours = Math.floor(hours);
        const minutes = Math.round((hours - wholeHours) * 60);

        let result = '';
        if (wholeHours > 0) {
            result += `${ wholeHours }h `;
        }
        if (minutes > 0) {
            result += `${ minutes }m`;
        }

        return result.trim() || '0h';
    }

    /**
     * 根据工作日志 id 修改飞书工作日志
     * @param workLogId 工作日志 id
     * @param workItemTypeId 工作项类型 id
     * @param workItemEntityId 工作项实体 id
     * @param nodeId 节点 id
     * @param workTime 工作时间(小时)
     * @param workDesc 工作描述
     * @param workDate 工作日期
     * @returns 修改结果
     */
    public async updateLarkWorkLog(
        workLogId: string,
        workItemTypeId: string,
        workItemEntityId: string,
        nodeId: string,
        workTime: number,
        workDesc: string,
        workDate: string,
    ): Promise<AxiosResponse<any>> {
        try {
            // 确保 workDate 是 YYYY-MM-DD 格式
            const formattedDate = new Date(workDate).toISOString();

            return await this.request('post', `/workHour/updateNodeWorkHour`, {
                id: workLogId,
                'workItemId': workItemTypeId,
                'workItemEntityId': workItemEntityId,
                'nodeId': nodeId,
                'actWorkHour': workTime,
                'workDesc': workDesc,
                'workDate': formattedDate,
                'taskId': null,
                'taskHourId': null,
                'registrantUserKey': this.config.userKey,
            });
        } catch (error) {
            this.logger.error(`更新工时日志失败 [ID: ${ workLogId }]:`, error);
            throw error;
        }
    }

    /**
     * 根据工作日志 id 删除飞书工作日志
     * @param workLogId 工作日志 id
     * @returns 删除结果
     */
    public async deleteLarkWorkLog(workLogId: string): Promise<AxiosResponse<any>> {
        try {
            return await this.request('post', `/workHour/deleteNodeWorkHour`, {
                id: workLogId,
            });
        } catch (error) {
            this.logger.error(`删除工时日志失败 [ID: ${ workLogId }]:`, error);
            throw error;
        }
    }

    /**
     * 新增飞书工作日志
     * @param workItemTypeId 工作项类型 id
     * @param workItemEntityId 工作项实体 id
     * @param nodeId 节点 id
     * @param workTime 工作时间(小时)
     * @param workDesc 工作描述
     * @param workDate 工作日期 (格式: YYYY-MM-DD)
     * @returns 新增结果
     */
    public async addLarkWorkLog(
        workItemTypeId: string,
        workItemEntityId: string,
        nodeId: string,
        workTime: number,
        workDesc: string,
        workDate: string,
    ): Promise<AxiosResponse<any>> {
        try {
            // 确保 workDate 是 YYYY-MM-DD 格式
            const formattedDate = new Date(workDate).toISOString();

            return await this.request('post', `/entityInstance/batchInsertNodeWorkHour`, {
                addWorkHourRequests: [{
                    workItemId: workItemTypeId,
                    workItemEntityId,
                    nodeId,
                    actWorkHour: workTime,
                    workDesc,
                    workDate: formattedDate,
                    addTaskWorkHourRequestList: [],
                }],
                registrantUserKey: this.config.userKey,
            });
        } catch (error) {
            this.logger.error(`添加工时日志失败 [工作项: ${ workItemEntityId }, 时间: ${ workTime }小时]:`, error);
            throw error;
        }
    }

    /**
     * 获取工作项节点列表
     * @param workDate 工作日期
     * @param workItemTypeId 工作项类型id
     * @param workItemEntityId 工作项id
     * @returns {
     'nodeName': '开发评估',
     'scheduleDate': '',
     'estimatedScore': '0.00小时(0.00人天)',
     'todayWorkTime': 0,
     'hasNext': false,
     'id': 3662185,
     'workItemId': '67da6360e9d810fd8008b7a4',
     'registeredWorkTime': '0.00小时 (0.00人天)',
     'residueWorkTime': '0小时 (0人天)',
     'nodeId': 'started',
     'workItemEntityId': 5888038418
     }
     * @returns 节点列表
     */
    public async getWorkLogNodeList(workDate: string, workItemTypeId: string, workItemEntityId: string): Promise<AxiosResponse<any>> {
        // 确保 workDate 是 YYYY-MM-DD 格式
        const formattedDate = new Date(workDate).toISOString().split('T')[0];

        const queryParams = {
            startTime: '',
            endTime: '',
            workTime: formattedDate,
            workItemEntityId: workItemEntityId,
            workItemId: workItemTypeId,
            registrantUserKey: this.config.userKey,
        }
        const searchParams = new URLSearchParams();
        for (const [key, value] of Object.entries(queryParams)) {
            searchParams.append(key, String(value));
        }
        const res = await this.request('get', `/entityInstance/new/getEntityNode?${ searchParams.toString() }`);
        return res.data.data;
    }

    /**
     * 获取特定日期的所有工时记录
     * @param date 日期(格式: YYYY-MM-DD 或 Date对象)
     * @param page 当前页码
     * @param pageSize 每页条数
     * @returns 工作日志列表
     */
    public async getLarkWorkLogsByDate(date: string | Date, page: number = 1, pageSize: number = 50): Promise<any[]> {
        try {
            // 处理日期格式
            const dateObj = typeof date === 'string' ? new Date(date) : date;
            const formattedDate = dateObj.toISOString().split('T')[0];

            // 设置开始和结束时间（当日的起止时间）
            const startDate = `${ formattedDate } 00:00:00`;
            const endDate = `${ formattedDate } 23:59:59`;

            this.logger.debug(`获取日期 ${ formattedDate } 的工时记录`);

            // 发送请求获取指定日期范围的工时记录
            const res = await this.request('post', '/workHour/queryNodeWorkHour', {
                'startDate': startDate,
                'endDate': endDate,
                'pageNo': page,
                'pageSize': pageSize,
                'statisticType': 1, // 个人工时统计
                'userIdList': [],  // 空数组表示当前用户
            });

            // 检查结果
            const worklogData = res.data.data;
            if (!worklogData || !Array.isArray(worklogData.nodeWorkHours)) {
                this.logger.warn(`未获取到 ${ formattedDate } 的工时记录`);
                return [];
            }

            // 格式化工时记录
            const formattedEntries = worklogData.nodeWorkHours.map((workLog: any) => {
                return this.formatWorkLog(workLog,'registeredWorkTime');
            });

            this.logger.debug(`获取到 ${ formattedDate } 的工时记录: ${ formattedEntries.length } 条`);
            return formattedEntries;
        } catch (error) {
            this.logger.error(`获取日期 ${ date } 的工时记录失败:`, error);
            throw error;
        }
    }
}