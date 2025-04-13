<script lang="ts">
    import { onMount } from 'svelte';
    import { showMessage } from 'siyuan';
    import { ConfigManager } from '../conf';
    import type { Config } from '../types';
    import { FieldType } from '../types';

    // 组件属性
    export let plugin: any;
    export let configManager: ConfigManager;
    export let onConfigSaved: () => Promise<void> = async () => {
    };

    // 配置数据 - 初始化默认空配置，防止未加载时访问属性报错
    let config: Config = configManager.getConfig();
    
    let optionColors: Record<string, Record<string, string>> = {};
    let fixedOptionColors: Record<string, Record<string, string>> = {};

    // UI 状态
    let activeTab: string = 'jira';
    let showFieldMappingEditor = false;
    let showColorEditor = false;
    let mappingKeys: string[] = [];
    let currentConfigType: 'jira' | 'lark' = 'jira';
    let selectedField: string = '';
    let editingOptions: { name: string, color: string }[] = [];

    // 可用颜色配置
    const availableColors = [
        { id: '1', color: '#FFE8E8', name: '浅红' },
        { id: '2', color: '#FFEFCF', name: '浅橙' },
        { id: '3', color: '#FCF2E6', name: '浅棕' },
        { id: '4', color: '#623CEA', name: '深紫' },
        { id: '5', color: '#DEFCF0', name: '浅绿' },
        { id: '6', color: '#E7F9F9', name: '浅青' },
        { id: '7', color: '#E2F5FF', name: '浅蓝' },
        { id: '8', color: '#F9EEFF', name: '浅紫' },
        { id: '9', color: '#FFF2DC', name: '浅黄' },
        { id: '10', color: '#FFE9E8', name: '粉红' },
        { id: '11', color: '#F8F9FA', name: '浅灰' },
        { id: '12', color: '#F6EEDC', name: '米黄' },
        { id: '13', color: '#F5F8FF', name: '淡蓝' },
        { id: '14', color: '#FFFFFF', name: '白色' },
    ];

    // 颜色ID到实际颜色值的映射
    const colorMap: Record<string, string> = Object.fromEntries(
        availableColors.map(color => [color.id, color.color]),
    );

    // 组件加载时初始化配置
    onMount(async () => {
        await loadConfig();

        // 确保新增配置项有默认值
        if (config.enableTimeTracking === undefined) {
            config.enableTimeTracking = true;
        }
        if (config.syncToDailyNote === undefined) {
            config.syncToDailyNote = false;
        }
    });

    // 加载配置数据
    async function loadConfig() {
        await configManager.loadAllConfigs();

        // 加载配置
        config = configManager.getConfig();
        // 加载选项颜色
        optionColors = configManager.getOptionColors();
        fixedOptionColors = configManager.getFixedOptionColors();
        // 更新映射键
        updateMappingKeys();
    }

    // 更新字段映射键列表
    function updateMappingKeys() {
        const targetConfig = currentConfigType === 'jira' ? config.jiraConfig : config.larkConfig;
        if (targetConfig && targetConfig.fieldMappings) {
            mappingKeys = Object.keys(targetConfig.fieldMappings);
        } else {
            mappingKeys = [];
        }
    }

    // 打开字段映射编辑器
    function openFieldMappingEditor(configType: 'jira' | 'lark') {
        currentConfigType = configType;
        updateMappingKeys();
        showFieldMappingEditor = true;
    }

    // 添加新字段映射
    function addNewMapping() {
        const targetConfig = currentConfigType === 'jira' ? config.jiraConfig : config.larkConfig;
        if (!targetConfig) return;

        const newKey = `字段${ Object.keys(targetConfig.fieldMappings || {}).length + 1 }`;

        if (!targetConfig.fieldMappings) targetConfig.fieldMappings = {};
        if (!targetConfig.fieldTypes) targetConfig.fieldTypes = {};

        targetConfig.fieldMappings[newKey] = '';
        targetConfig.fieldTypes[newKey] = FieldType.TEXT;
        updateMappingKeys();
    }

    // 删除字段映射
    function removeMapping(key: string) {
        const targetConfig = currentConfigType === 'jira' ? config.jiraConfig : config.larkConfig;
        if (!targetConfig || !targetConfig.fieldMappings || !targetConfig.fieldTypes) return;

        delete targetConfig.fieldMappings[key];
        delete targetConfig.fieldTypes[key];
        updateMappingKeys();
    }

    // 重命名字段映射
    function renameMapping(oldKey: string, newKey: string) {
        if (oldKey === newKey) return;

        const targetConfig = currentConfigType === 'jira' ? config.jiraConfig : config.larkConfig;
        if (!targetConfig || !targetConfig.fieldMappings || !targetConfig.fieldTypes) return;

        const value = targetConfig.fieldMappings[oldKey];
        const type = targetConfig.fieldTypes[oldKey];

        delete targetConfig.fieldMappings[oldKey];
        delete targetConfig.fieldTypes[oldKey];

        targetConfig.fieldMappings[newKey] = value;
        targetConfig.fieldTypes[newKey] = type;
        updateMappingKeys();
    }

    // 获取颜色样式
    function getColorStyle(colorId: string): string {
        return colorMap[colorId] || '#F8F9FA';
    }

    // 获取字段的所有选项
    function getFieldOptions(fieldName: string): { name: string, color: string }[] {
        const mergedOptions: { name: string, color: string }[] = [];
        const fieldFixed = fixedOptionColors[fieldName] || {};
        const fieldAuto = optionColors[fieldName] || {};

        // 添加固定选项颜色
        Object.entries(fieldFixed).forEach(([name, colorId]) => {
            mergedOptions.push({ name, color: colorId });
        });

        // 添加自动选项（排除已有固定颜色的）
        Object.entries(fieldAuto).forEach(([name, colorId]) => {
            if (!fieldFixed[name]) {
                mergedOptions.push({ name, color: colorId });
            }
        });

        return mergedOptions;
    }

    // 打开颜色编辑器
    function openColorEditor(fieldName: string) {
        selectedField = fieldName;
        const fieldFixed = fixedOptionColors[fieldName] || {};
        const fieldAuto = optionColors[fieldName] || {};

        // 合并选项列表
        editingOptions = [
            ...Object.entries(fieldFixed).map(([name, color]) => ({ name, color })),
            ...Object.entries(fieldAuto)
                .filter(([name]) => !fieldFixed[name])
                .map(([name, color]) => ({ name, color })),
        ];

        showColorEditor = true;
    }

    // 添加新选项
    function addNewOption() {
        editingOptions = [
            ...editingOptions,
            { name: `选项${ editingOptions.length + 1 }`, color: '1' },
        ];
    }

    // 删除选项
    function removeOption(index: number) {
        editingOptions = editingOptions.filter((_, i) => i !== index);
    }

    // 保存选项颜色配置
    async function saveColorConfig() {
        const optionsMap = Object.fromEntries(
            editingOptions.map(option => [option.name, option.color]),
        );

        await configManager.setFixedOptionColors(selectedField, optionsMap);
        showColorEditor = false;
        await loadConfig();
        showMessage('选项颜色配置已保存');
    }

    // 保存所有设置
    async function saveSettings() {
        await configManager.updateConfig(config as Config);
        showMessage('设置已保存');
        await onConfigSaved();
    }

    // 辅助函数：获取映射字段值
    function getConfigValue(key: string) {
        const targetConfig = currentConfigType === 'jira' ? config.jiraConfig : config.larkConfig;
        return targetConfig && targetConfig.fieldMappings ? targetConfig.fieldMappings[key] : '';
    }

    // 辅助函数：设置映射字段值
    function setConfigValue(key: string, value: string) {
        const targetConfig = currentConfigType === 'jira' ? config.jiraConfig : config.larkConfig;
        if (targetConfig && targetConfig.fieldMappings) {
            targetConfig.fieldMappings[key] = value;
        }
    }

    // 辅助函数：获取映射字段类型
    function getConfigType(key: string) {
        const targetConfig = currentConfigType === 'jira' ? config.jiraConfig : config.larkConfig;
        return targetConfig && targetConfig.fieldTypes ? targetConfig.fieldTypes[key] : FieldType.TEXT;
    }

    // 辅助函数：设置映射字段类型
    function setConfigType(key: string, value: string) {
        const targetConfig = currentConfigType === 'jira' ? config.jiraConfig : config.larkConfig;
        if (targetConfig && targetConfig.fieldTypes) {
            targetConfig.fieldTypes[key] = value;
        }
    }
</script>

<div class="b3-dialog__content">
    <div class="b3-dialog__body">
        <!-- 选项卡导航 -->
        <div class="tab-container">
            <div class="tab-header">
                {#each [
                    {id: 'jira', name: 'JIRA配置'},
                    {id: 'lark', name: '飞书配置'},
                    {id: 'advanced', name: '高级设置'}
                ] as tab}
                    <button
                            class="tab-button {activeTab === tab.id ? 'active' : ''}"
                            on:click={() => activeTab = tab.id}
                    >
                        {tab.name}
                    </button>
                {/each}
            </div>

            <div class="tab-content">
                <!-- JIRA 配置面板 -->
                {#if activeTab === 'jira'}
                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                JIRA服务器URL
                                <div class="b3-label__text">
                                    JIRA服务器的URL，例如: https://your-domain.atlassian.net
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-text-field fn__flex-center fn__size200"
                                    bind:value={config.jiraConfig.jiraBaseUrl}
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                JIRA用户名
                                <div class="b3-label__text">
                                    JIRA账号的用户名，用于API认证
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-text-field fn__flex-center fn__size200"
                                    bind:value={config.jiraConfig.jiraUsername}
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                JIRA API令牌
                                <div class="b3-label__text">
                                    JIRA账号的API令牌，用于API认证
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-text-field fn__flex-center fn__size200"
                                    type="password"
                                    bind:value={config.jiraConfig.jiraToken}
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <div class="fn__flex">
                            <div class="fn__flex-1">
                                字段映射
                                <div class="b3-label__text">
                                    配置思源数据库字段与JIRA字段的映射关系。支持复杂路径表达式：
                                    <ul style="margin-top: 4px; padding-left: 20px;">
                                        <li>简单路径: fields.status.name</li>
                                        <li>JavaScript表达式: js: data.fields.summary + ' (' + data.key + ')'</li>
                                    </ul>
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <button
                                    class="b3-button b3-button--outline fn__flex-center fn__size200"
                                    on:click={() => openFieldMappingEditor('jira')}
                            >
                                编辑映射
                            </button>
                        </div>
                    </div>
                {/if}

                <!-- 飞书配置面板 -->
                {#if activeTab === 'lark'}
                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                飞书API基础URL
                                <div class="b3-label__text">
                                    飞书开放平台API的基础URL，通常为https://open.feishu.cn
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-text-field fn__flex-center fn__size200"
                                    bind:value={config.larkConfig.larkBaseUrl}
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                Plugin ID
                                <div class="b3-label__text">
                                    飞书应用的Plugin ID
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-text-field fn__flex-center fn__size200"
                                    bind:value={config.larkConfig.pluginId}
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                Plugin Secret
                                <div class="b3-label__text">
                                    飞书应用的Plugin Secret
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-text-field fn__flex-center fn__size200"
                                    type="password"
                                    bind:value={config.larkConfig.pluginSecret}
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                用户标识
                                <div class="b3-label__text">
                                    飞书用户的唯一标识
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-text-field fn__flex-center fn__size200"
                                    bind:value={config.larkConfig.userKey}
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                空间ID
                                <div class="b3-label__text">
                                    飞书项目所在的空间ID
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-text-field fn__flex-center fn__size200"
                                    bind:value={config.larkConfig.spaceId}
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                工时管理API地址
                                <div class="b3-label__text">
                                    飞书工时管理的API接口地址
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-text-field fn__flex-center fn__size200"
                                    bind:value={config.larkConfig.larkWorkLogUrl}
                                    placeholder="https://feishu-api.example.com"
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                工时管理认证Token
                                <div class="b3-label__text">
                                    飞书工时管理系统的认证Token
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-text-field fn__flex-center fn__size200"
                                    bind:value={config.larkConfig.authToken}
                                    type="password"
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                项目标识(Project Key)
                                <div class="b3-label__text">
                                    飞书工时管理系统的项目标识，用于API请求头
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-text-field fn__flex-center fn__size200"
                                    bind:value={config.larkConfig.projectKey}
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <div class="fn__flex">
                            <div class="fn__flex-1">
                                字段映射
                                <div class="b3-label__text">
                                    配置思源数据库字段与飞书字段的映射关系。支持复杂路径表达式：
                                    <ul style="margin-top: 4px; padding-left: 20px;">
                                        <li>简单路径: status.name</li>
                                        <li>JavaScript表达式: js: data.type.display_name + ' - ' + data.name</li>
                                    </ul>
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <button
                                    class="b3-button b3-button--outline fn__flex-center fn__size200"
                                    on:click={() => openFieldMappingEditor('lark')}
                            >
                                编辑映射
                            </button>
                        </div>
                    </div>
                {/if}

                <!-- 高级设置面板 -->
                {#if activeTab === 'advanced'}
                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                日志级别
                                <div class="b3-label__text">
                                    设置插件日志的输出级别
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <select
                                    class="b3-select fn__flex-center fn__size200"
                                    bind:value={config.logLevel}
                            >
                                <option value="debug">调试</option>
                                <option value="info">信息</option>
                                <option value="warn">警告</option>
                                <option value="error">错误</option>
                            </select>
                        </label>
                    </div>

                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                启用工时记录
                                <div class="b3-label__text">
                                    在任务详情页显示工时记录面板
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-switch fn__flex-center"
                                    type="checkbox"
                                    bind:checked={config.enableTimeTracking}
                            />
                        </label>
                    </div>

                    <div class="config__item">
                        <label class="fn__flex">
                            <div class="fn__flex-1">
                                同步到日记
                                <div class="b3-label__text">
                                    将工时记录同步到思源笔记日记中
                                </div>
                            </div>
                            <span class="fn__space"></span>
                            <input
                                    class="b3-switch fn__flex-center"
                                    type="checkbox"
                                    bind:checked={config.syncToDailyNote}
                            />
                        </label>
                    </div>
                {/if}
            </div>
        </div>

        <!-- 字段映射编辑器 -->
        {#if showFieldMappingEditor}
            <div class="custom-dialog">
                <div class="custom-dialog-content field-mapping-dialog">
                    <div class="custom-dialog-header">
                        <div class="custom-dialog-title">
                            {currentConfigType === 'jira' ? 'JIRA字段映射' : '飞书字段映射'}
                        </div>
                        <button class="b3-button b3-button--outline custom-dialog-close"
                                on:click={() => showFieldMappingEditor = false}>×
                        </button>
                    </div>
                    <div class="custom-dialog-body">
                        <div class="field-mapping-editor">
                            <div class="field-mapping-header">
                                <div class="field-name">思源数据库列名</div>
                                <div class="field-value">
                                    {currentConfigType === 'jira' ? 'JIRA字段路径' : '飞书字段路径'}
                                </div>
                                <div class="field-type">数据类型</div>
                                <div class="field-action">操作</div>
                            </div>

                            {#each mappingKeys as key}
                                <div class="field-mapping-row">
                                    <input 
                                        class="b3-text-field field-name-input" 
                                        bind:value={key}
                                        on:blur={() => {
                                            if (key !== mappingKeys[mappingKeys.indexOf(key)]) {
                                                renameMapping(mappingKeys[mappingKeys.indexOf(key)], key);
                                            }
                                        }}
                                    />
                                    <textarea 
                                        class="b3-text-field field-value-input" 
                                        value={getConfigValue(key)}
                                        on:input={(e) => setConfigValue(key, e.currentTarget.value)}
                                        placeholder={currentConfigType === 'jira' 
                                            ? "例如: fields.status.name" 
                                            : "例如: status.name"}
                                        rows="3"
                                    ></textarea>
                                    <select 
                                        class="b3-select field-type-select" 
                                        value={getConfigType(key)}
                                        on:change={(e) => setConfigType(key, e.currentTarget.value)}
                                    >
                                        <option value={FieldType.TEXT}>文本</option>
                                        <option value={FieldType.DATE}>日期</option>
                                        <option value={FieldType.SELECT}>单选</option>
                                        <option value={FieldType.URL}>链接</option>
                                    </select>
                                    <div class="field-action-group">
                                        {#if getConfigType(key) === FieldType.SELECT}
                                            <button 
                                                class="b3-button b3-button--outline field-color-button" 
                                                title="配置选项颜色"
                                                on:click={() => openColorEditor(key)}
                                            >
                                                配置
                                            </button>
                                        {/if}
                                        <button 
                                            class="b3-button b3-button--outline field-action-button" 
                                            on:click={() => removeMapping(key)}
                                        >
                                            删除
                                        </button>
                                    </div>
                                </div>

                                {#if getConfigType(key) === FieldType.SELECT && getFieldOptions(key).length > 0}
                                    <div class="field-options-preview">
                                        <div class="field-options-title">已有选项:</div>
                                        <div class="field-options-list">
                                            {#each getFieldOptions(key) as option}
                                                <div class="field-option-item"
                                                     style="background-color: {getColorStyle(option.color)}">
                                                    {option.name}
                                                </div>
                                            {/each}
                                        </div>
                                    </div>
                                {/if}
                            {/each}

                            <div class="field-mapping-footer">
                                <button
                                        class="b3-button b3-button--outline fn__flex-center"
                                        on:click={addNewMapping}
                                >
                                    添加字段映射
                                </button>
                            </div>
                        </div>
                    </div>
                    <div class="custom-dialog-footer">
                        <button
                                class="b3-button b3-button--outline"
                                on:click={() => showFieldMappingEditor = false}
                        >
                            取消
                        </button>
                        <button
                                class="b3-button b3-button--outline b3-button--primary"
                                on:click={() => {
                                saveSettings();
                                showMessage('字段映射已保存');
                                showFieldMappingEditor = false;
                            }}
                        >
                            保存
                        </button>
                    </div>
                </div>
            </div>
        {/if}

        <!-- 保存按钮 -->
        <div class="config__item">
            <label class="fn__flex">
                <div class="fn__flex-1"></div>
                <span class="fn__space"></span>
                <button class="b3-button b3-button--outline fn__flex-center fn__size200" on:click={saveSettings}>
                    保存
                </button>
            </label>
        </div>
    </div>
</div>

<!-- 选项颜色编辑器对话框 -->
{#if showColorEditor}
    <div class="custom-dialog">
        <div class="custom-dialog-content">
            <div class="custom-dialog-header">
                <div class="custom-dialog-title">配置选项颜色 - {selectedField}</div>
                <button class="b3-button b3-button--outline custom-dialog-close"
                        on:click={() => showColorEditor = false}>×
                </button>
            </div>
            <div class="custom-dialog-body">
                <div class="option-editor">
                    <div class="option-header">
                        <div class="option-name">选项名称</div>
                        <div class="option-color">颜色</div>
                        <div class="option-action"></div>
                    </div>
                    {#each editingOptions as option, i}
                        <div class="option-row">
                            <input class="b3-text-field option-name-input" bind:value={option.name}/>
                            <select class="b3-select option-color-select" bind:value={option.color}>
                                {#each availableColors as color}
                                    <option value={color.id} style="background-color: {color.color}; padding: 4px;">
                                        {color.name}
                                    </option>
                                {/each}
                            </select>
                            <button
                                    class="b3-button b3-button--outline option-action-button"
                                    on:click={() => removeOption(i)}
                            >
                                删除
                            </button>
                        </div>
                    {/each}
                    <div class="option-footer">
                        <button class="b3-button b3-button--outline" on:click={addNewOption}>添加选项</button>
                    </div>
                </div>
            </div>
            <div class="custom-dialog-footer">
                <button class="b3-button b3-button--outline" on:click={() => showColorEditor = false}>取消</button>
                <button class="b3-button b3-button--outline" on:click={saveColorConfig}>保存</button>
            </div>
        </div>
    </div>
{/if}

<style>
    /* 基础样式变量 */
    :root {
        --padding-xs: 4px;
        --padding-sm: 8px;
        --padding-md: 16px;
        --border-radius: 4px;
        --border-radius-circle: 50%;
        --transition-speed: 0.2s;
        --box-shadow-sm: 0 1px 4px rgba(0, 0, 0, 0.05);
        --box-shadow-md: 0 4px 16px rgba(0, 0, 0, 0.15);
        --border-color: var(--b3-border-color);
        --bg-light: var(--b3-theme-surface-light);
        --bg-normal: var(--b3-theme-surface);
        --text-color: var(--b3-theme-on-surface);
        --primary-color: var(--b3-theme-primary);
        --animation-duration: 0.2s;
    }

    /* 布局与通用组件 */
    .config__item {
        margin-bottom: var(--padding-md);
        padding: var(--padding-sm);
        border-radius: var(--border-radius);
        transition: background-color var(--transition-speed) ease;
    }

    .config__item:hover {
        background-color: var(--bg-light);
    }

    .b3-label__text {
        margin-top: var(--padding-xs);
        opacity: 0.8;
    }

    /* 设置对话框固定高度和滚动 */
    .b3-dialog__body {
        height: 500px;
        overflow-y: auto;
        padding-right: 8px;
    }

    /* 表单元素美化 */
    .b3-text-field {
        transition: border-color var(--transition-speed) ease, box-shadow var(--transition-speed) ease;
    }

    .b3-text-field:focus {
        box-shadow: 0 0 0 2px rgba(var(--b3-theme-primary-rgb), 0.2);
    }

    .b3-button {
        transition: all var(--transition-speed) ease;
    }

    .b3-button:hover {
        background-color: var(--bg-normal);
    }

    /* 选项卡样式 */
    .tab-container {
        margin-bottom: var(--padding-md);
        display: flex;
        flex-direction: column;
        height: 100%;
    }

    .tab-header {
        display: flex;
        border-bottom: 1px solid var(--border-color);
        margin-bottom: var(--padding-md);
        flex-shrink: 0;
    }

    .tab-button {
        padding: var(--padding-sm) var(--padding-md);
        background: none;
        border: none;
        cursor: pointer;
        font-size: 14px;
        color: var(--text-color);
        transition: all var(--transition-speed) ease;
        position: relative;
    }

    .tab-button:hover {
        color: var(--primary-color);
    }

    .tab-button.active {
        font-weight: 600;
        color: var(--primary-color);
    }

    .tab-button.active::after {
        content: '';
        position: absolute;
        bottom: -1px;
        left: 0;
        width: 100%;
        height: 2px;
        background-color: var(--primary-color);
    }

    .tab-content {
        flex-grow: 1;
        overflow-y: auto;
        padding: var(--padding-sm) 0;
    }

    /* 确保保存按钮在底部固定 */
    .config__item:last-child {
        margin-bottom: 0;
        padding-bottom: 0;
    }

    /* 字段映射编辑器 */
    .field-mapping-editor {
        margin-top: var(--padding-md);
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        box-shadow: var(--box-shadow-sm);
        overflow: hidden;
    }

    .field-mapping-header, .option-header {
        display: flex;
        padding: var(--padding-sm);
        font-weight: 600;
        border-bottom: 1px solid var(--border-color);
        background-color: var(--bg-normal);
    }

    .field-mapping-row, .option-row {
        display: flex;
        padding: var(--padding-sm);
        border-bottom: 1px solid var(--border-color);
        transition: background-color var(--transition-speed) ease;
        align-items: flex-start;
    }

    .field-mapping-row:hover, .option-row:hover {
        background-color: var(--bg-light);
    }

    /* 字段映射元素 */
    .field-name, .field-name-input {
        flex: 1;
        margin-right: var(--padding-sm);
    }

    .field-value, .field-value-input {
        flex: 2;
        margin-right: var(--padding-sm);
        min-height: 60px;
        resize: vertical;
        line-height: 1.5;
        padding: 8px;
    }

    .field-type, .field-type-select {
        flex: 1;
        margin-right: var(--padding-sm);
    }

    .field-action, .field-action-button {
        width: 60px;
    }

    .field-action-group {
        display: flex;
        gap: var(--padding-xs);
    }

    .field-color-button {
        width: 32px;
        padding: 0;
    }

    /* 字段映射底部和选项展示 */
    .field-mapping-footer, .option-footer {
        padding: var(--padding-sm);
        display: flex;
        justify-content: center;
        gap: var(--padding-sm);
        background-color: var(--bg-light);
    }

    .field-options-preview {
        padding: var(--padding-xs) var(--padding-sm) var(--padding-sm) var(--padding-sm);
        margin-top: -8px;
        margin-bottom: var(--padding-sm);
        background-color: var(--bg-light);
        border-bottom: 1px solid var(--border-color);
    }

    .field-options-title {
        font-size: 12px;
        color: var(--text-color);
        margin-bottom: var(--padding-xs);
    }

    .field-options-list {
        display: flex;
        flex-wrap: wrap;
        gap: var(--padding-xs);
    }

    .field-option-item {
        padding: 2px var(--padding-sm);
        border-radius: var(--border-radius);
        font-size: 12px;
        color: #333333;
        box-shadow: var(--box-shadow-sm);
        transition: transform var(--transition-speed) ease;
    }

    .field-option-item:hover {
        transform: translateY(-1px);
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.15);
    }

    /* 选项编辑器样式 */
    .option-editor {
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        overflow: hidden;
    }

    .option-name, .option-name-input {
        flex: 2;
        margin-right: var(--padding-sm);
    }

    .option-color, .option-color-select {
        flex: 1;
        margin-right: var(--padding-sm);
    }

    .option-action, .option-action-button {
        width: 60px;
    }

    .option-color-select option {
        padding: var(--padding-xs) var(--padding-sm);
        margin: 2px 0;
    }

    /* 对话框样式 */
    .custom-dialog {
        position: fixed;
        inset: 0;
        background-color: rgba(0, 0, 0, 0.4);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1000;
        backdrop-filter: blur(2px);
        animation: fadeIn var(--animation-duration) ease;
    }

    @keyframes fadeIn {
        from {
            opacity: 0;
        }
        to {
            opacity: 1;
        }
    }

    .custom-dialog-content {
        background-color: var(--b3-theme-background);
        border-radius: var(--border-radius);
        box-shadow: var(--box-shadow-md);
        width: 500px;
        max-width: 90vw;
        max-height: 80vh;
        display: flex;
        flex-direction: column;
        animation: slideIn var(--animation-duration) ease;
    }

    @keyframes slideIn {
        from {
            transform: translateY(20px);
            opacity: 0.8;
        }
        to {
            transform: translateY(0);
            opacity: 1;
        }
    }

    .custom-dialog-header {
        padding: var(--padding-md);
        border-bottom: 1px solid var(--border-color);
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .custom-dialog-title {
        font-weight: 600;
        font-size: 16px;
    }

    .custom-dialog-close {
        width: 32px;
        height: 32px;
        padding: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: var(--border-radius-circle);
        transition: background-color var(--transition-speed) ease;
    }

    .custom-dialog-close:hover {
        background-color: var(--bg-normal);
    }

    .custom-dialog-body {
        padding: var(--padding-md);
        overflow-y: auto;
        flex-grow: 1;
    }

    .custom-dialog-footer {
        padding: var(--padding-md);
        border-top: 1px solid var(--border-color);
        display: flex;
        justify-content: flex-end;
        gap: var(--padding-sm);
    }

    /* 字段映射弹窗样式 */
    .field-mapping-dialog {
        width: 800px;
        max-width: 90vw;
    }

    .field-action {
        width: 120px;
        text-align: center;
    }

    .b3-button--primary {
        background-color: var(--primary-color);
        color: white;
    }

    .b3-button--primary:hover {
        background-color: var(--primary-color);
        opacity: 0.9;
    }

    /* 美化字段映射编辑器 */
    .field-mapping-editor {
        border: 1px solid var(--border-color);
        border-radius: var(--border-radius);
        box-shadow: var(--box-shadow-sm);
        overflow: hidden;
        margin-bottom: var(--padding-md);
    }

    .field-mapping-header {
        background-color: var(--bg-normal);
        font-weight: 600;
        padding: var(--padding-md) var(--padding-sm);
        display: flex;
        border-bottom: 1px solid var(--border-color);
    }

    .field-mapping-row {
        padding: var(--padding-md) var(--padding-sm);
        display: flex;
        border-bottom: 1px solid var(--border-color);
        align-items: center;
    }

    .field-mapping-row:hover {
        background-color: var(--bg-light);
    }

    .field-name-input {
        flex: 1;
        margin-right: var(--padding-sm);
    }

    .field-value-input {
        flex: 2;
        margin-right: var(--padding-sm);
    }

    .field-type-select {
        width: 100px;
        margin-right: var(--padding-sm);
    }

    .field-action-group {
        display: flex;
        gap: var(--padding-sm);
        justify-content: flex-end;
        width: 120px;
    }

    .field-color-button, .field-action-button {
        padding: 4px 8px;
        white-space: nowrap;
    }
</style> 