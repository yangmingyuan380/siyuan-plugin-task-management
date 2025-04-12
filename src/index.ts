import { Plugin, Dialog, showMessage } from 'siyuan';
import Settings from './components/Settings.svelte';
import { Logger } from './utils';
import { JiraService, LarkService, DatabaseService } from './services';
import { Config } from './types';
import { ConfigManager } from './conf';

export default class JiraIntegrationPlugin extends Plugin {
    private configs: Config; // 配置信息
    private logger: Logger; // 日志工具实例
    private jiraService: JiraService; // JIRA服务
    private larkService: LarkService; // 飞书服务
    private databaseService: DatabaseService; // 数据库服务
    private configManager: ConfigManager; // 配置管理器

    async onload() {
        // 初始化日志工具
        this.logger = new Logger('info');
        
        // 初始化配置管理器
        this.configManager = new ConfigManager(this, this.logger);
        
        // 加载所有配置
        await this.configManager.loadAllConfigs();
        
        // 获取配置
        this.configs = this.configManager.getConfig();

        // 更新日志级别
        this.logger.setLevel(this.configs.logLevel);

        // 初始化服务
        this.jiraService = new JiraService(this.configs.jiraConfig, this.logger);
        this.larkService = new LarkService(this.configs.larkConfig, this.logger, this.configManager);
        this.databaseService = new DatabaseService(this.logger, this.configManager);

        // 监听数据库单元格失焦事件
        this.eventBus.on('click-editorcontent', this.handleCellBlur);
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
            showMessage(this.i18n.jiraFetching?.replace('{issueKey}', issueKey) || `正在获取 JIRA 项目 ${issueKey}...`, 2000);
            const issueData = await this.jiraService.fetchJiraIssue(issueKey);
            if (issueData) {
                await this.databaseService.updateDatabaseRow(
                    rowId, 
                    issueData, 
                    this.configs.jiraConfig.fieldMappings,
                    this.configs.jiraConfig.fieldTypes
                );
                showMessage(this.i18n.jiraUpdateSuccess?.replace('{issueKey}', issueKey) || `JIRA 项目 ${issueKey} 更新成功`, 3000);
            }
        } catch (error) {
            this.logger.error('获取JIRA信息失败:', error);
            showMessage(this.i18n.jiraUpdateFailed?.replace('{issueKey}', issueKey) || `JIRA 项目 ${issueKey} 更新失败`, 3000, 'error');
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
            showMessage(this.i18n.larkFetching?.replace('{issueKey}', issueKey) || `正在获取飞书项目 ${issueKey}...`, 2000);
            const issueData = await this.larkService.fetchLarkIssue(issueKey);
            if (issueData) {
                await this.databaseService.updateDatabaseRow(
                    rowId, 
                    issueData, 
                    this.configs.larkConfig.fieldMappings, 
                    this.configs.larkConfig.fieldTypes
                );
                showMessage(this.i18n.larkUpdateSuccess?.replace('{issueKey}', issueKey) || `飞书项目 ${issueKey} 更新成功`, 3000);
            } else {
                showMessage(this.i18n.larkIssueNotFound?.replace('{issueKey}', issueKey) || `未找到飞书项目 ${issueKey}`, 3000, 'error');
            }
        } catch (error) {
            this.logger.error('获取飞书项目信息失败:', error);
            showMessage(this.i18n.larkUpdateFailed?.replace('{issueKey}', issueKey) || `飞书项目 ${issueKey} 更新失败`, 3000, 'error');
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

    onunload() {
        this.eventBus.off('click-editorcontent', this.handleCellBlur);
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
}