import { Plugin, Dialog, showMessage, IProtyle } from 'siyuan';
import Settings from './components/Settings.svelte';
import TimeTrackingPanel from './components/TimeTrackingPanel.svelte';
import { Logger } from './utils';
import { JiraService, LarkService, DatabaseService } from './services';
import { Config, SiyuanEvents } from './types';
import { ConfigManager } from './conf';
import * as SiYuanAPI from './api';

export default class JiraIntegrationPlugin extends Plugin {
    private configs: Config; // 配置信息
    private logger: Logger; // 日志工具实例
    private jiraService: JiraService; // JIRA服务
    private larkService: LarkService; // 飞书服务
    private databaseService: DatabaseService; // 数据库服务
    private configManager: ConfigManager; // 配置管理器

    async onload() {
        // 1. 初始化日志和配置
        this.logger = new Logger('debug');
        this.configManager = new ConfigManager(this, this.logger);
        await this.configManager.loadAllConfigs();
        this.configs = this.configManager.getConfig();

        // 2. 确保配置项有默认值
        if (this.configs.enableTimeTracking === undefined) {
            this.configs.enableTimeTracking = true;
            await this.configManager.saveConfig();
        }
        if (this.configs.syncToDailyNote === undefined) {
            this.configs.syncToDailyNote = false;
            await this.configManager.saveConfig();
        }

        // 3. 更新日志级别
        this.logger.setLevel(this.configs.logLevel || 'debug');

        // 4. 添加插件样式
        this.addStyles();

        // 5. 初始化服务
        this.jiraService = new JiraService(this.configs.jiraConfig, this.logger);
        this.larkService = new LarkService(this.configs.larkConfig, this.logger, this.configManager);
        this.databaseService = new DatabaseService(this.logger, this.configManager);

        // 6. 注册事件监听
        this.registerEventListeners();
        
        this.logger.info('任务管理插件加载完成');
    }
    
    /**
     * 注册事件监听器
     */
    private registerEventListeners() {
        // 监听数据库单元格失焦事件
        this.eventBus.on('click-editorcontent', this.handleCellBlur);
        
        // 如果启用了工时记录功能，添加相关事件监听
        if (this.configs.enableTimeTracking) {
            this.eventBus.on(SiyuanEvents.LOADED_PROTYLE_STATIC, this.addTimeTrackingPanel);
        }
    }

    private handleCellBlur = async (event: CustomEvent) => {
        const detail = event.detail;
        this.logger.debug('单元格失焦:', detail);

        // 获取目标元素
        const target = detail.event?.target;
        if (!target) return;

        // 查找最近的单元格元素
        const cellElement = target.closest('.av__cell');
        if (!cellElement) return;

        // 获取单元格文本内容
        const cellText = cellElement.querySelector('.av__celltext')?.textContent;
        if (typeof cellText === 'string') {
            // 先获取行元素，再获取行ID
            const rowElement = cellElement.closest('.av__row');
            if (!rowElement) {
                this.logger.error('找不到行元素');
                return;
            }

            const rowId = rowElement.getAttribute('data-id');
            if (!rowId) {
                this.logger.error('找不到行ID');
                return;
            }

            this.logger.debug('获取到行ID:', rowId);

            // 识别不同类型的项目ID
            if (cellText.startsWith('FXD-')) {
                // JIRA项目
                await this.processJiraIssue(cellText, rowId);
            } else if (cellText.match(/^[A-Za-z0-9]{8,}$/)) {
                // 飞书项目ID通常是较长的字母数字组合
                await this.processFeishuIssue(cellText, rowId);
            }
        }
    }

    private async processJiraIssue(issueKey: string, rowId: string) {
        try {
            showMessage(this.i18n.jiraFetching?.replace('{issueKey}', issueKey) || `正在获取 JIRA 项目 ${ issueKey }...`, 2000);
            const issueData = await this.jiraService.fetchJiraIssue(issueKey);
            if (issueData) {
                await this.databaseService.updateDatabaseRow(
                    rowId,
                    issueData,
                    this.configs.jiraConfig.fieldMappings,
                    this.configs.jiraConfig.fieldTypes,
                );
                showMessage(this.i18n.jiraUpdateSuccess?.replace('{issueKey}', issueKey) || `JIRA 项目 ${ issueKey } 更新成功`, 3000);
            }
        } catch (error) {
            this.logger.error('获取JIRA信息失败:', error);
            showMessage(this.i18n.jiraUpdateFailed?.replace('{issueKey}', issueKey) || `JIRA 项目 ${ issueKey } 更新失败`, 3000, 'error');
        }
    }

    /**
     * 处理飞书项目
     * @param issueKey
     * @param rowId
     * @private
     */
    private async processFeishuIssue(issueKey: string, rowId: string) {
        try {
            showMessage(this.i18n.larkFetching?.replace('{issueKey}', issueKey) || `正在获取飞书项目 ${ issueKey }...`, 2000);
            const issueData = await this.larkService.fetchLarkIssue(issueKey);
            if (issueData) {
                await this.databaseService.updateDatabaseRow(
                    rowId,
                    issueData,
                    this.configs.larkConfig.fieldMappings,
                    this.configs.larkConfig.fieldTypes,
                );
                showMessage(this.i18n.larkUpdateSuccess?.replace('{issueKey}', issueKey) || `飞书项目 ${ issueKey } 更新成功`, 3000);
            } else {
                showMessage(this.i18n.larkIssueNotFound?.replace('{issueKey}', issueKey) || `未找到飞书项目 ${ issueKey }`, 3000, 'error');
            }
        } catch (error) {
            this.logger.error('获取飞书项目信息失败:', error);
            showMessage(this.i18n.larkUpdateFailed?.replace('{issueKey}', issueKey) || `飞书项目 ${ issueKey } 更新失败`, 3000, 'error');
        }
    }

    /**
     * 设置固定选项颜色映射
     * @param fieldName 字段名称
     * @param optionColors 选项颜色映射 {选项名: 颜色ID}
     */
    public async setFixedOptionColors(fieldName: string, optionColors: Record<string, string>) {
        await this.configManager.setFixedOptionColors(fieldName, optionColors);
    }

    // 添加工时面板方法
    private addTimeTrackingPanel = async (event: CustomEvent) => {
        try {
            if (!this.configs.enableTimeTracking) {
                return;
            }
            
            const openProtyle: IProtyle = event.detail.protyle;
            if (!openProtyle?.block?.rootID) {
                return;
            }
            
            const blockId = openProtyle.block.rootID;
            this.logger.debug('处理文档:', blockId);
            
            // 1. 获取文档顶部节点
            const topNode = this.getProtyleTopNode(blockId);
            if (!topNode) {
                return;
            }
            
            // 2. 获取文档属性
            const blockAttrs = await SiYuanAPI.getBlockAttrs(blockId);
            if (!blockAttrs) {
                return;
            }
            
            this.logger.debug('获取到块属性:', blockAttrs);
            
            // 3. 从title属性中查找任务ID或日期
            const title = blockAttrs.title;
            if (!title) {
                return;
            }
            
            // 定义正则模式
            const jiraPattern = /\b([A-Z]+-\d+)\b/;
            const larkPattern = /\b([A-Za-z0-9]{8,})\b/;
            const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/; // 匹配 YYYY-MM-DD 格式的日期
            
            // 尝试匹配任务ID或日期
            let issueKey = null;
            let type = null;
            let isDateFormat = false;
            
            // 检查是否为日期格式
            const dateMatch = title.match(datePattern);
            if (dateMatch) {
                const dateStr = dateMatch[0];
                const validDate = new Date(dateStr);
                // 确保是有效日期
                if (!isNaN(validDate.getTime())) {
                    this.logger.debug(`标题是日期格式: ${dateStr}`);
                    isDateFormat = true;
                    
                    // 为日期格式创建并挂载日期工时汇总面板
                    const panelContainer = await this.createDateSummaryPanel(blockId, dateStr);
                    topNode.after(panelContainer);
                    this.logger.debug(`成功添加日期工时汇总面板: ${dateStr}`);
                    return;
                }
            }
            
            // 如果不是日期格式，继续检查任务ID
            // 优先检查JIRA ID
            const jiraMatch = title.match(jiraPattern);
            if (jiraMatch) {
                issueKey = jiraMatch[1];
                type = 'jira';
                this.logger.debug(`找到JIRA任务ID: ${issueKey}`);
            } else {
                // 尝试匹配飞书ID
                const larkMatch = title.match(larkPattern);
                if (larkMatch) {
                    issueKey = larkMatch[1];
                    type = 'lark';
                    this.logger.debug(`找到飞书任务ID: ${issueKey}`);
                }
            }
            
            // 如果找到了任务ID
            if (issueKey && type) {
                // 4. 创建并挂载面板
                const panelContainer = await this.createAndMountPanel(blockId, issueKey, type, openProtyle);
                topNode.after(panelContainer);
                this.logger.debug(`成功添加工时面板: ${issueKey}`);
            }
        } catch (error) {
            this.logger.error('添加工时记录面板失败:', error);
        }
    }
    
    // 创建并挂载面板
    private async createAndMountPanel(blockId: string, issueKey: string, type: 'jira' | 'lark', protyle: IProtyle): Promise<HTMLElement> {
        // 1. 删除已存在的面板
        const existingPanel = document.getElementById(`time-tracking-panel-${issueKey}`);
        if (existingPanel) {
            existingPanel.remove();
        }
        
        // 2. 获取任务数据
        let issueData;
        if (type === 'jira') {
            issueData = await this.jiraService.fetchJiraIssue(issueKey);
        } else {
            issueData = await this.larkService.fetchLarkIssue(issueKey);
        }
        
        if (!issueData) {
            throw new Error(`未找到任务数据: ${issueKey}`);
        }
        
        // 3. 创建面板容器
        const panelContainer = document.createElement('div');
        panelContainer.id = `time-tracking-panel-${issueKey}`;
        panelContainer.className = 'time-tracking-panel-container';
        
        // 4. 挂载Svelte组件
        new TimeTrackingPanel({
            target: panelContainer,
            props: {
                docId: blockId,
                issueKey,
                issueData,
                type,
                jiraService: this.jiraService,
                larkService: this.larkService,
                logger: this.logger,
                syncToDailyNote: this.configs.syncToDailyNote,
            },
        });
        
        return panelContainer;
    }

    // 为日期创建工时汇总面板
    private async createDateSummaryPanel(blockId: string, dateStr: string): Promise<HTMLElement> {
        // 1. 删除已存在的面板
        const existingPanel = document.getElementById(`time-tracking-panel-date-${dateStr}`);
        if (existingPanel) {
            existingPanel.remove();
        }
        
        // 2. 获取该日期的工时记录
        const worklogData = await this.larkService.fetchWorklogByDate(dateStr);
        
        // 3. 创建面板容器
        const panelContainer = document.createElement('div');
        panelContainer.id = `time-tracking-panel-date-${dateStr}`;
        panelContainer.className = 'time-tracking-panel-container';
        
        // 4. 挂载Svelte组件 - 重用TimeTrackingPanel组件
        new TimeTrackingPanel({
            target: panelContainer,
            props: {
                docId: blockId,
                issueKey: dateStr, // 使用日期作为ID
                issueData: { 
                    summary: `${dateStr} 工时汇总`,
                    name: `${dateStr} 工时汇总` 
                },
                type: 'lark', // 当前仅支持飞书工时汇总
                jiraService: this.jiraService,
                larkService: this.larkService,
                logger: this.logger,
                syncToDailyNote: this.configs.syncToDailyNote,
                isDateSummary: true, // 标记为日期汇总
                dateTimeEntries: worklogData.items, // 传入已获取的工时记录
            },
        });
        
        return panelContainer;
    }

    onunload() {
        // 1. 移除事件监听
        this.eventBus.off('click-editorcontent', this.handleCellBlur);
        if (this.configs.enableTimeTracking) {
            this.eventBus.off(SiyuanEvents.LOADED_PROTYLE_STATIC, this.addTimeTrackingPanel);
        }
        
        // 2. 移除添加的样式
        document.getElementById('task-management-styles')?.remove();
        
        // 3. 移除所有已添加的工时面板
        document.querySelectorAll('.time-tracking-panel-container').forEach(panel => {
            panel.remove();
        });
        
        this.logger.info('任务管理插件已卸载');
    }

    openSetting(): void {
        let dialog = new Dialog({
            title: this.i18n.jiraSettings || '集成设置',
            content: `<div id="JiraSettings" style="height: 100%;"></div>`,
            width: '720px',
            destroyCallback: (options) => {
                this.logger.debug('destroyCallback', options);
                settingComponent.$destroy();
            },
        });

        let settingComponent = new Settings({
            target: dialog.element.querySelector('#JiraSettings'),
            props: {
                plugin: this,
                configManager: this.configManager,
                onConfigSaved: async () => {
                    // 配置更新后刷新本地对象
                    this.configs = this.configManager.getConfig();

                    // 更新日志级别
                    this.logger.setLevel(this.configs.logLevel);

                    // 更新服务的配置
                    this.jiraService = new JiraService(this.configs.jiraConfig, this.logger);
                    this.larkService = new LarkService(this.configs.larkConfig, this.logger, this.configManager);

                    showMessage('配置已重新加载');
                },
            },
        });
    }


    private getProtyleTopNode(nodeId) {
        const titleNode = document.querySelector(
            `div[data-node-id="${nodeId}"].protyle-title`,
        );

        if (!titleNode) {
            this.logger.debug("No title node found, hide panel", { nodeId });
            return false;
        }

        // const protyleAttrElement = titleNode.querySelector("div.protyle-attr");
        // if (!protyleAttrElement || !protyleAttrElement.firstChild) {
        //     this.logger.debug("No protyle-attr element found, hide panel", {
        //         nodeId,
        //     });
        //     return false;
        // }

        return titleNode.closest(".protyle-top");
    }

    // 添加CSS样式
    private addStyles() {
        const styleElement = document.createElement('style');
        styleElement.id = 'task-management-styles';
        styleElement.textContent = `
            .time-tracking-panel-container {
                margin: 16px 0;
                border-radius: 5px;
                overflow: hidden;
                box-shadow: 0 1px 3px rgba(0, 0, 0, 0.12);
            }
        `;
        document.head.appendChild(styleElement);
    }
}