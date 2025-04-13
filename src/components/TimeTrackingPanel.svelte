<script lang="ts">
    import { onMount } from 'svelte';
    import { slide } from 'svelte/transition';
    import { Dialog, showMessage } from 'siyuan';
    import type { Logger } from '../utils';
    import type { JiraService, LarkService } from '../services';
    import {
        formatDate,
        formatDateForEdit,
        calculateTotalTime,
        loadTimeEntries,
        loadNodeList,
        validateTimeEntry,
        appendToDailyNote,
        deleteTimeEntry,
        removeFromDailyNote,
    } from './TimeTrackingPanel';
    import type { TimeEntry, WorkItemNode } from './TimeTrackingPanel';

    // 组件属性
    export let docId: string;       // 文档ID
    export let issueKey: string;       // 任务ID
    export let issueData: any;         // 任务数据
    export let type: 'jira' | 'lark';  // 任务类型
    export let jiraService: JiraService;
    export let larkService: LarkService;
    export let logger: Logger;
    export let syncToDailyNote: boolean = false;
    export let isDateSummary: boolean = false; // 是否为日期汇总模式
    export let dateTimeEntries: TimeEntry[] = []; // 传入的日期工时记录

    // 状态变量
    let timeEntries: TimeEntry[] = [];
    let isLoading = false;
    let error = '';
    let isEditing = false;
    let editingIndex = -1;
    let activeTimeDialog: Dialog | null = null;

    // 节点相关状态
    let nodeList: WorkItemNode[] = []; // 工作项节点列表
    let isLoadingNodes = false; // 是否正在加载节点
    let nodeError = ''; // 节点加载错误信息

    // 折叠状态控制
    let isExpanded = true; // 日期汇总模式默认展开

    // 工时记录表单
    let newTimeEntry: TimeEntry = {
        id: '',
        startTime: formatDate(new Date()),
        endTime: formatDate(new Date()),
        description: '',
        timeSpent: '1h',
        nodeId: '', // 添加节点ID字段
        nodeName: '', // 添加节点名称字段
    };

    // 初始化
    onMount(async () => {
        // 如果是日期汇总模式且有传入的工时记录，直接使用
        if (isDateSummary && dateTimeEntries && dateTimeEntries.length > 0) {
            timeEntries = dateTimeEntries;
            isLoading = false;
        } else {
            await refresh();
        }
    });

    // 刷新数据
    async function refresh() {
        // 加载工时记录
        isLoading = true;

        if (isDateSummary) {
            // 日期汇总模式，重新加载该日期的工时记录
            try {
                const worklogData = await larkService.fetchWorklogByDate(issueKey);
                timeEntries = worklogData.items || [];
                error = '';
            } catch (err) {
                error = `加载日期工时记录失败: ${ err.message }`;
                logger.error('加载日期工时记录失败:', err);
                timeEntries = [];
            }
        } else {
            // 常规模式，加载工作项的工时记录
            const result = await loadTimeEntries(type, issueKey, jiraService, larkService, logger);
            timeEntries = result.timeEntries;
            error = result.error;
        }

        isLoading = false;

        // 如果是飞书且不是日期汇总模式，加载节点列表
        if (type === 'lark' && !isDateSummary) {
            isLoadingNodes = true;
            const nodeResult = await loadNodeList(type, issueKey, larkService, logger);
            nodeList = nodeResult.nodeList;
            nodeError = nodeResult.error;
            isLoadingNodes = false;
        }
    }

    // 切换折叠/展开状态
    function toggleExpand() {
        isExpanded = !isExpanded;
    }

    // 打开添加工时弹窗
    function openAddModal() {
        resetForm();

        activeTimeDialog = new Dialog({
            title: '添加工时记录',
            content: `<div id="timeEntryDialog"></div>`,
            width: '500px',
            height: '550px',
            destroyCallback: () => {
                activeTimeDialog = null;
            },
        });

        // 添加确认按钮事件
        const confirmBtn = activeTimeDialog.element.querySelector('.b3-button--text');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', submitTimeEntry);
        }

        setTimeout(renderDialogContent, 50);
    }

    // 打开编辑工时弹窗
    function openEditModal(index: number) {
        const entry = timeEntries[index];

        // 复制数据到表单
        newTimeEntry = {
            id: entry.id,
            startTime: formatDateForEdit(entry.startTime),
            endTime: formatDate(new Date()),
            description: entry.description,
            timeSpent: entry.timeSpent,
            nodeId: entry.nodeId,
            nodeName: entry.nodeName,
        };

        isEditing = true;
        editingIndex = index;

        activeTimeDialog = new Dialog({
            title: '编辑工时记录',
            content: `<div id="timeEntryDialog"></div>`,
            width: '500px',
            height: '550px',
            destroyCallback: () => {
                activeTimeDialog = null;
                isEditing = false;
            },
        });

        // 添加确认按钮事件
        const confirmBtn = activeTimeDialog.element.querySelector('.b3-button--text');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', submitTimeEntry);
        }

        setTimeout(renderDialogContent, 50);
    }

    // 渲染弹窗内容
    function renderDialogContent() {
        if (!activeTimeDialog) return;

        const dialogContainer = document.getElementById('timeEntryDialog');
        if (!dialogContainer) return;

        dialogContainer.innerHTML = `
      <div class="time-entry-form-dialog">
        ${ error ? `<div class="error-message">${ error }</div>` : '' }
        ${ nodeError ? `<div class="error-message">${ nodeError }</div>` : '' }
        
        <div class="form-group">
          <label for="startTime">开始日期</label>
          <input type="date" id="startTime" value="${ newTimeEntry.startTime }" />
        </div>
        
        <div class="form-group">
          <label for="timeSpent">耗时</label>
          <input type="text" id="timeSpent" value="${ newTimeEntry.timeSpent }"
                placeholder="例如: 1h 30m" />
        </div>
        
        ${ type === 'lark' ? `
        <div class="form-group">
          <label for="nodeId">工作阶段/节点</label>
          <select id="nodeId" class="node-select">
            <option value="">-- 请选择工作节点 --</option>
            ${ nodeList.map(node => `
              <option value="${ node.nodeId }" ${ newTimeEntry.nodeId === node.nodeId ? 'selected' : '' }>
                ${ node.nodeName || '未命名节点' } ${ node.hasNext ? '(下一步)' : '' }
              </option>
            `).join('') }
          </select>
          ${ isLoadingNodes ? '<div class="loading-hint">加载节点中...</div>' : '' }
          ${ nodeList.length === 0 && !isLoadingNodes ? '<div class="hint">未找到工作节点</div>' : '' }
        </div>
        ` : '' }
        
        <div class="form-group">
          <label for="description">描述</label>
          <textarea id="description" placeholder="请输入工作内容...">${ newTimeEntry.description }</textarea>
        </div>
        
        <div class="form-actions">
          <button class="save-button" id="saveTimeEntry">
            ${ isLoading ? '保存中...' : (isEditing ? '更新工时' : '保存工时') }
          </button>
          <button class="cancel-button" id="cancelTimeEntry">取消</button>
        </div>
      </div>
    `;

        // 添加事件监听
        const startTimeInput = dialogContainer.querySelector('#startTime') as HTMLInputElement;
        const timeSpentInput = dialogContainer.querySelector('#timeSpent') as HTMLInputElement;
        const descriptionInput = dialogContainer.querySelector('#description') as HTMLTextAreaElement;
        const nodeSelect = dialogContainer.querySelector('#nodeId') as HTMLSelectElement;
        const saveButton = dialogContainer.querySelector('#saveTimeEntry') as HTMLButtonElement;
        const cancelButton = dialogContainer.querySelector('#cancelTimeEntry') as HTMLButtonElement;

        if (startTimeInput) {
            startTimeInput.addEventListener('change', (e) => {
                newTimeEntry.startTime = (e.target as HTMLInputElement).value;
            });
        }

        if (timeSpentInput) {
            timeSpentInput.addEventListener('input', (e) => {
                newTimeEntry.timeSpent = (e.target as HTMLInputElement).value;
            });
        }

        if (descriptionInput) {
            descriptionInput.addEventListener('input', (e) => {
                newTimeEntry.description = (e.target as HTMLTextAreaElement).value;
            });
        }

        if (nodeSelect) {
            nodeSelect.addEventListener('change', (e) => {
                const selectedNodeId = (e.target as HTMLSelectElement).value;
                newTimeEntry.nodeId = selectedNodeId;

                // 设置节点名称
                const selectedNode = nodeList.find(node => node.nodeId === selectedNodeId);
                newTimeEntry.nodeName = selectedNode ? selectedNode.nodeName : '';
            });
        }

        if (saveButton) {
            saveButton.addEventListener('click', async () => {
                await submitTimeEntry();
            });
        }

        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                if (activeTimeDialog) {
                    activeTimeDialog.destroy();
                }
            });
        }
    }

    // 重置表单
    function resetForm() {
        const now = new Date();
        newTimeEntry = {
            id: '',
            startTime: formatDate(now),
            endTime: formatDate(now),
            description: '',
            timeSpent: '1h',
            nodeId: '',
            nodeName: '',
        };
        isEditing = false;
        editingIndex = -1;
    }

    // 提交工时记录
    async function submitTimeEntry() {
        if (!newTimeEntry.timeSpent || !newTimeEntry.description) {
            showMessage('请填写完整的工时信息', 3000, 'error');
            return;
        }

        // 飞书工时记录需要节点信息
        if (type === 'lark' && !newTimeEntry.nodeId && nodeList.length > 0) {
            showMessage('请选择工作节点', 3000, 'error');
            return;
        }

        isLoading = true;
        error = '';

        try {
            // 格式验证
            validateTimeEntry(newTimeEntry);

            // 处理提交的数据
            const submitData = { ...newTimeEntry };

            // 飞书工时需要添加节点信息
            if (type === 'lark') {
                // 如果没有选择节点，但有节点列表，使用第一个
                if (!submitData.nodeId && nodeList.length > 0) {
                    submitData.nodeId = nodeList[0].nodeId;
                    submitData.nodeName = nodeList[0].nodeName;
                }
            }

            let result = false;

            if (isEditing && submitData.id) {
                try {
                    // 尝试更新现有工时记录
                    const updateResult = type === 'jira'
                        ? await jiraService.updateWorklog(issueKey, submitData.id, submitData)
                        : await larkService.updateWorklog(issueKey, submitData.id, submitData);

                    result = updateResult.success;
                } catch (updateErr) {
                    logger.warn('尝试直接更新工时记录失败，将改为删除后重新创建', updateErr);
                    // 如果更新失败，回退到删除再添加的策略
                    await deleteTimeEntry(editingIndex, timeEntries, type, issueKey, jiraService, larkService, logger, false);

                    // 添加新记录
                    const addResult = type === 'jira'
                        ? await jiraService.addWorklog(issueKey, submitData)
                        : await larkService.addWorklog(issueKey, submitData);

                    result = addResult.success;
                    // 更新ID
                    if (addResult.success && addResult.id) {
                        submitData.id = addResult.id;
                        logger.debug(`删除后重新创建成功，新ID: ${ addResult.id }`);
                    }
                }
            } else {
                // 新增工时记录
                const addResult = type === 'jira'
                    ? await jiraService.addWorklog(issueKey, submitData)
                    : await larkService.addWorklog(issueKey, submitData);

                result = addResult.success;

                // 获取并保存新记录的ID
                if (addResult.success && addResult.id) {
                    submitData.id = addResult.id;
                    logger.debug(`新添加工时记录ID: ${ addResult.id }`);
                }
            }

            if (result) {
                // 记录成功，如果启用，添加到日记
                if (syncToDailyNote) {
                    await appendToDailyNote(submitData, docId, issueKey, logger);
                }

                // 关闭弹窗
                if (activeTimeDialog) {
                    activeTimeDialog.destroy();
                }

                // 重新加载工时记录
                await refresh();

                // 添加新记录后展开面板
                isExpanded = true;

                showMessage('工时记录已保存', 3000);
            }
        } catch (err) {
            error = `提交工时记录失败: ${ err.message }`;
            logger.error('提交工时记录失败:', err);
            showMessage(`提交失败: ${ err.message }`, 3000, 'error');
        } finally {
            isLoading = false;
        }
    }

    // 处理删除工时记录
    async function handleDeleteTimeEntry(index: number) {
        isLoading = true;
        const result = await deleteTimeEntry(index, timeEntries, type, issueKey, jiraService, larkService, logger);
        if (result) {
            await refresh();
        }
        isLoading = false;
    }

    // 编辑日期汇总中的工时记录
    async function openEditDateWorklogModal(index: number) {
        const entry = timeEntries[index];

        // 复制数据到表单
        newTimeEntry = {
            id: entry.id,
            startTime: formatDateForEdit(entry.startTime),
            endTime: formatDate(new Date()),
            description: entry.description,
            timeSpent: entry.timeSpent,
            nodeId: entry.nodeId,
            nodeName: entry.nodeName,
            workItemId: entry.workItemId,
            workItemEntityId: entry.workItemEntityId,
            workItemEntityName: entry.workItemEntityName,
        };

        isEditing = true;
        editingIndex = index;

        activeTimeDialog = new Dialog({
            title: `编辑工时记录 - ${ entry.workItemEntityName || '未知任务' }`,
            content: `<div id="timeEntryDialog"></div>`,
            width: '500px',
            height: '550px',
            destroyCallback: () => {
                activeTimeDialog = null;
                isEditing = false;
            },
        });

        // 添加确认按钮事件
        const confirmBtn = activeTimeDialog.element.querySelector('.b3-button--text');
        if (confirmBtn) {
            confirmBtn.addEventListener('click', submitDateWorklogEdit);
        }

        setTimeout(renderDateWorklogEditDialog, 50);
    }

    // 渲染日期工时编辑对话框
    function renderDateWorklogEditDialog() {
        if (!activeTimeDialog) return;

        const dialogContainer = document.getElementById('timeEntryDialog');
        if (!dialogContainer) return;

        dialogContainer.innerHTML = `
      <div class="time-entry-form-dialog">
        ${ error ? `<div class="error-message">${ error }</div>` : '' }
        
        <div class="form-group task-info">
          <div class="task-name">${ newTimeEntry.workItemEntityName || '未知任务' }</div>
        </div>
        
        <div class="form-group">
          <label for="startTime">日期</label>
          <input type="date" id="startTime" value="${ newTimeEntry.startTime }" disabled />
        </div>
        
        <div class="form-group">
          <label for="timeSpent">耗时</label>
          <input type="text" id="timeSpent" value="${ newTimeEntry.timeSpent }"
                placeholder="例如: 1h 30m" />
        </div>
        
        <div class="form-group">
          <label for="description">描述</label>
          <textarea id="description" placeholder="请输入工作内容...">${ newTimeEntry.description }</textarea>
        </div>
        
        <div class="form-actions">
          <button class="save-button" id="saveTimeEntry">
            ${ isLoading ? '保存中...' : '更新工时' }
          </button>
          <button class="cancel-button" id="cancelTimeEntry">取消</button>
        </div>
      </div>
    `;

        // 添加事件监听
        const timeSpentInput = dialogContainer.querySelector('#timeSpent') as HTMLInputElement;
        const descriptionInput = dialogContainer.querySelector('#description') as HTMLTextAreaElement;
        const saveButton = dialogContainer.querySelector('#saveTimeEntry') as HTMLButtonElement;
        const cancelButton = dialogContainer.querySelector('#cancelTimeEntry') as HTMLButtonElement;

        if (timeSpentInput) {
            timeSpentInput.addEventListener('input', (e) => {
                newTimeEntry.timeSpent = (e.target as HTMLInputElement).value;
            });
        }

        if (descriptionInput) {
            descriptionInput.addEventListener('input', (e) => {
                newTimeEntry.description = (e.target as HTMLTextAreaElement).value;
            });
        }

        if (saveButton) {
            saveButton.addEventListener('click', async () => {
                await submitDateWorklogEdit();
            });
        }

        if (cancelButton) {
            cancelButton.addEventListener('click', () => {
                if (activeTimeDialog) {
                    activeTimeDialog.destroy();
                }
            });
        }
    }

    // 提交日期工时编辑
    async function submitDateWorklogEdit() {
        if (!newTimeEntry.timeSpent || !newTimeEntry.description) {
            showMessage('请填写完整的工时信息', 3000, 'error');
            return;
        }

        isLoading = true;
        error = '';

        try {
            if (!newTimeEntry.id || !newTimeEntry.workItemId || !newTimeEntry.workItemEntityId) {
                throw new Error('工时记录信息不完整，无法更新');
            }

            // 创建更新数据对象
            const worklogData = {
                id: newTimeEntry.id,
                description: newTimeEntry.description,
                timeSpent: newTimeEntry.timeSpent,
                startTime: newTimeEntry.startTime,
                nodeId: newTimeEntry.nodeId,
                nodeName: newTimeEntry.nodeName,
                workItemEntityName: newTimeEntry.workItemEntityName,
                workItemId: newTimeEntry.workItemId,
                workItemEntityId: newTimeEntry.workItemEntityId,
            };

            // 尝试更新工时记录
            const workItemId = newTimeEntry.workItemEntityId.toString();
            const updateResult = await larkService.updateWorklog(workItemId, newTimeEntry.id, worklogData);

            if (updateResult.success) {
                logger.debug(`成功更新工时记录: ${ newTimeEntry.id }`);

                // 同步到日记（复用单个任务的日记同步逻辑）
                if (syncToDailyNote) {
                    try {
                        // 将工作项ID作为docId参数传递，以便正确关联
                        const entryWithIssueKey = {
                            ...worklogData,
                            issueKey: workItemId,  // 添加issueKey字段用于日记中的引用
                            endTime: formatDate(new Date()), // 添加缺少的endTime字段
                        };
                        await appendToDailyNote(entryWithIssueKey, docId, workItemId, logger);
                        logger.debug('已同步工时记录到日记');
                    } catch (syncErr) {
                        logger.warn('同步到日记失败，但工时记录已更新', syncErr);
                    }
                }

                // 关闭弹窗
                if (activeTimeDialog) {
                    activeTimeDialog.destroy();
                }

                // 重新加载工时记录
                await refresh();

                showMessage('工时记录已更新', 3000);
            } else {
                throw new Error('更新工时记录失败');
            }
        } catch (err) {
            error = `更新工时记录失败: ${ err.message }`;
            logger.error('更新工时记录失败:', err);
            showMessage(`更新失败: ${ err.message }`, 3000, 'error');
        } finally {
            isLoading = false;
        }
    }

    // 处理删除日期工时记录
    async function handleDeleteDateWorklog(index: number) {
        const entry = timeEntries[index];
        if (!entry.id || !entry.workItemEntityId) {
            showMessage('工时记录信息不完整，无法删除', 3000, 'error');
            return;
        }

        if (!confirm('确定要删除这条工时记录吗？')) {
            return;
        }

        isLoading = true;
        try {
            const workItemId = entry.workItemEntityId.toString();
            const result = await larkService.deleteWorklog(workItemId, entry.id);

            if (result.success) {
                await refresh();
                showMessage('工时记录已删除', 3000);
                await removeFromDailyNote(entry.id, logger)
            } else {
                throw new Error('删除工时记录失败');
            }
        } catch (err) {
            error = `删除工时记录失败: ${ err.message }`;
            logger.error('删除工时记录失败:', err);
            showMessage(`删除失败: ${ err.message }`, 3000, 'error');
        } finally {
            isLoading = false;
        }
    }
</script>

<div class="time-tracking-panel">
    <div class="panel-header" class:expanded={isExpanded} on:click={toggleExpand}>
        <div class="panel-header-left">
            <div class="header-main">
                <h2>{isDateSummary ? '日期工时汇总' : '工时记录'}</h2>
                <span class="time-count">{timeEntries.length > 0 ? `(${timeEntries.length})` : ''}</span>
                <span class="expand-icon">{isExpanded ? '▼' : '▶'}</span>
            </div>
            <div class="issue-info">
                <div class="issue-key">{issueKey}</div>
                <div class="issue-summary">{issueData?.summary || issueData?.name || '未知任务'}</div>
            </div>
        </div>
        <div class="panel-header-right">
            {#if !isDateSummary}
                <button class="add-button" on:click={(e) => { e.stopPropagation(); openAddModal(); }}
                        disabled={isLoading}>
                    <span class="button-icon">+</span>
                    <span class="button-text">记录工时</span>
                </button>
            {:else}
                <button class="refresh-button" on:click={(e) => { e.stopPropagation(); refresh(); }}
                        disabled={isLoading}>
                    <span class="button-icon">↻</span>
                    <span class="button-text">刷新</span>
                </button>
            {/if}
        </div>
    </div>

    {#if isExpanded}
        <div class="panel-content" transition:slide={{ duration: 300 }}>
            {#if error}
                <div class="error-message">{error}</div>
            {/if}

            <!-- 工时记录列表 -->
            <div class="time-entries-list">
                {#if isLoading && timeEntries.length === 0}
                    <div class="loading-container">
                        <div class="loading-spinner"></div>
                        <span>加载中...</span>
                    </div>
                {:else if timeEntries.length === 0}
                    <div class="empty-state">
                        <div class="empty-icon">📝</div>
                        <p>{isDateSummary ? '当日暂无工时记录' : '暂无工时记录'}</p>
                        {#if !isDateSummary}
                            <button class="empty-add-button" on:click={(e) => { e.stopPropagation(); openAddModal(); }}>
                                添加第一条工时记录
                            </button>
                        {/if}
                    </div>
                {:else}
                    <div class="time-summary">
                        <span>总计工时: <strong>{calculateTotalTime(timeEntries)}</strong></span>
                        <span>记录数: <strong>{timeEntries.length}</strong></span>
                    </div>

                    <table>
                        <thead>
                        <tr>
                            <th>操作人</th>
                            <th>日期</th>
                            <th>耗时</th>
                            {#if isDateSummary}
                                <th>任务</th>
                            {/if}
                            {#if type === 'lark' && !isDateSummary}
                                <th>工作节点</th>
                            {/if}
                            <th>描述</th>
                            <th>操作</th>
                        </tr>
                        </thead>
                        <tbody>
                        {#each timeEntries as entry, i}
                            <tr>
                                <td class="author-cell">
                                    {#if entry.avatar}
                                        <div class="avatar with-image"
                                             style="background-image: url('{entry.avatar}')"></div>
                                    {:else}
                                        <div class="avatar">{entry.author ? entry.author.charAt(0) : '?'}</div>
                                    {/if}
                                    <span>{entry.author}</span>
                                </td>
                                <td>{new Date(entry.startTime).toLocaleDateString('zh-CN')}</td>
                                <td class="time-cell">{entry.timeSpent}</td>
                                {#if isDateSummary}
                                    <td class="task-cell">
                                        {#if entry.workItemEntityName}
                                            <span class="task-badge">{entry.workItemEntityName}</span>
                                        {/if}
                                    </td>
                                {/if}
                                {#if type === 'lark' && !isDateSummary}
                                    <td class="node-cell">
                                        {#if entry.nodeName}
                                            <span class="node-badge">{entry.nodeName}</span>
                                        {/if}
                                    </td>
                                {/if}
                                <td class="desc-cell">
                                    <div class="desc-text">{entry.description}</div>
                                </td>
                                <td class="action-cell">
                                    {#if !isDateSummary}
                                        <button class="icon-button edit"
                                                on:click={(e) => { e.stopPropagation(); openEditModal(i); }}
                                                disabled={isLoading} title="编辑">
                                            <span class="icon">✎</span>
                                        </button>
                                        <button class="icon-button delete"
                                                on:click={(e) => { e.stopPropagation(); handleDeleteTimeEntry(i); }}
                                                disabled={isLoading} title="删除">
                                            <span class="icon">×</span>
                                        </button>
                                    {:else}
                                        <button class="icon-button edit"
                                                on:click={(e) => { e.stopPropagation(); openEditDateWorklogModal(i); }}
                                                disabled={isLoading} title="编辑">
                                            <span class="icon">✎</span>
                                        </button>
                                        <button class="icon-button delete"
                                                on:click={(e) => { e.stopPropagation(); handleDeleteDateWorklog(i); }}
                                                disabled={isLoading} title="删除">
                                            <span class="icon">×</span>
                                        </button>
                                    {/if}
                                </td>
                            </tr>
                        {/each}
                        </tbody>
                    </table>
                {/if}
            </div>
        </div>
    {:else}
        <div class="collapsed-summary">
            <div class="collapsed-info">
                <span class="record-count">{timeEntries.length} 条记录</span>
                <span class="total-time">{calculateTotalTime(timeEntries)}</span>
            </div>
        </div>
    {/if}
</div>

<style>
    .time-tracking-panel {
        font-family: var(--b3-font-family);
        background-color: var(--b3-theme-background);
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        margin: 16px 0;
        padding: 16px;
        box-shadow: var(--b3-dialog-shadow);
        overflow: hidden;
    }

    .panel-header {
        padding: 8px;
        margin: -8px;
        border-radius: 4px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        cursor: pointer;
        user-select: none;
        transition: all 0.2s ease;
    }

    .panel-header:hover {
        background-color: var(--b3-theme-hover);
    }

    .panel-header.expanded {
        margin-bottom: 16px;
        border-bottom: 1px solid var(--b3-border-color);
        padding-bottom: 16px;
    }

    .panel-header-left {
        display: flex;
        flex-direction: column;
        gap: 4px;
    }

    .header-main {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .time-count {
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
    }

    .expand-icon {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        transition: transform 0.3s ease;
        display: inline-block;
        width: 16px;
        text-align: center;
    }

    .panel-header h2 {
        margin: 0;
        font-size: 18px;
        font-weight: 600;
        color: var(--b3-theme-on-background);
    }

    .issue-info {
        display: flex;
        gap: 8px;
        align-items: center;
    }

    .issue-key {
        font-family: var(--b3-font-family-code);
        background-color: var(--b3-theme-primary-lightest);
        color: var(--b3-theme-primary);
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 14px;
        font-weight: 500;
    }

    .issue-summary {
        font-size: 14px;
        color: var(--b3-theme-on-surface);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 300px;
    }

    .collapsed-summary {
        padding: 8px 4px;
        color: var(--b3-theme-on-surface-light);
        font-size: 14px;
        border-top: 1px dashed var(--b3-border-color);
        margin-top: 8px;
    }

    .collapsed-info {
        display: flex;
        justify-content: space-between;
    }

    .total-time {
        font-weight: 500;
        color: var(--b3-theme-primary);
    }

    .add-button {
        display: flex;
        align-items: center;
        gap: 6px;
        background-color: var(--b3-theme-primary);
        color: white;
        border: none;
        border-radius: var(--b3-border-radius);
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s;
        z-index: 2;
    }

    .add-button:hover {
        background-color: var(--b3-theme-primary-light);
    }

    .add-button:disabled {
        background-color: var(--b3-theme-background-light);
        color: var(--b3-theme-on-surface-light);
        cursor: not-allowed;
    }

    .button-icon {
        font-size: 18px;
        font-weight: bold;
    }

    .panel-content {
        display: flex;
        flex-direction: column;
    }

    .time-entries-list {
        width: 100%;
    }

    .time-summary {
        display: flex;
        justify-content: space-between;
        margin-bottom: 16px;
        padding: 8px 12px;
        background-color: var(--b3-theme-surface);
        border-radius: var(--b3-border-radius);
        font-size: 14px;
        color: var(--b3-theme-on-surface);
    }

    .loading-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 32px;
        color: var(--b3-theme-on-surface-light);
        gap: 12px;
    }

    .loading-spinner {
        width: 24px;
        height: 24px;
        border: 3px solid var(--b3-theme-background-light);
        border-top: 3px solid var(--b3-theme-primary);
        border-radius: 50%;
        animation: spin 1s linear infinite;
    }

    @keyframes spin {
        0% {
            transform: rotate(0deg);
        }
        100% {
            transform: rotate(360deg);
        }
    }

    .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 16px;
        color: var(--b3-theme-on-surface-light);
        text-align: center;
    }

    .empty-icon {
        font-size: 32px;
        margin-bottom: 16px;
    }

    .empty-state p {
        margin: 0 0 16px 0;
        font-size: 15px;
    }

    .empty-add-button {
        background-color: var(--b3-theme-primary-lighter);
        color: var(--b3-theme-primary);
        border: none;
        border-radius: var(--b3-border-radius);
        padding: 8px 16px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
    }

    .empty-add-button:hover {
        background-color: var(--b3-theme-primary-light);
        color: white;
    }

    .error-message {
        background-color: var(--b3-theme-error-lighter);
        color: var(--b3-theme-error);
        padding: 8px 12px;
        border-radius: var(--b3-border-radius);
        margin-bottom: 16px;
        font-size: 14px;
    }

    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 14px;
        background-color: var(--b3-theme-surface);
        border-radius: var(--b3-border-radius);
        overflow: hidden;
    }

    table th,
    table td {
        text-align: left;
        padding: 10px 12px;
        border-bottom: 1px solid var(--b3-border-color);
        vertical-align: top;
    }

    table th {
        font-weight: 500;
        color: var(--b3-theme-on-surface);
        background-color: var(--b3-theme-background-light);
    }

    table tr:last-child td {
        border-bottom: none;
    }

    table tr:hover {
        background-color: var(--b3-theme-hover);
    }

    .author-cell {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .avatar {
        width: 24px;
        height: 24px;
        border-radius: 50%;
        background-color: var(--b3-theme-primary-lighter);
        color: var(--b3-theme-primary);
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 500;
    }

    .avatar.with-image {
        background-size: cover;
        background-position: center;
        color: transparent;
    }

    .time-cell {
        font-family: var(--b3-font-family-code);
        color: var(--b3-theme-primary);
    }

    .desc-cell {
        max-width: 300px;
    }

    .desc-text {
        overflow: hidden;
        white-space: pre-wrap;
        line-height: 1.4;
        max-width: 300px;
    }

    .node-cell {
        white-space: nowrap;
    }

    .node-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        background-color: var(--b3-theme-primary-lighter);
        color: var(--b3-theme-primary);
    }

    .node-select {
        width: 100%;
        padding: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        background-color: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 14px;
    }

    .loading-hint {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        margin-top: 4px;
    }

    .hint {
        font-size: 12px;
        color: var(--b3-theme-on-surface-light);
        margin-top: 4px;
    }

    .action-cell {
        white-space: nowrap;
        width: 80px;
    }

    .icon-button {
        background: none;
        border: none;
        width: 28px;
        height: 28px;
        border-radius: 4px;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        transition: background-color 0.2s;
        font-size: 16px;
    }

    .icon-button:hover {
        background-color: var(--b3-theme-background-light);
    }

    .icon-button.edit {
        color: var(--b3-theme-primary);
    }

    .icon-button.delete {
        color: var(--b3-theme-error);
    }

    .icon-button:disabled {
        color: var(--b3-theme-on-surface-light);
        cursor: not-allowed;
    }

    /* 弹窗样式 */
    :global(.time-entry-form-dialog) {
        padding: 12px;
    }

    :global(.time-entry-form-dialog .form-group) {
        margin-bottom: 12px;
    }

    :global(.time-entry-form-dialog label) {
        display: block;
        font-size: 14px;
        margin-bottom: 6px;
        color: var(--b3-theme-on-surface);
    }

    :global(.time-entry-form-dialog input),
    :global(.time-entry-form-dialog textarea) {
        width: 100%;
        padding: 10px;
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        background-color: var(--b3-theme-surface);
        color: var(--b3-theme-on-surface);
        font-size: 14px;
    }

    :global(.time-entry-form-dialog textarea) {
        min-height: 80px;
        resize: vertical;
    }

    :global(.time-entry-form-dialog .form-actions) {
        display: flex;
        gap: 12px;
        margin-top: 16px;
    }

    :global(.time-entry-form-dialog .save-button) {
        flex: 1;
        background-color: var(--b3-theme-primary);
        color: white;
        border: none;
        border-radius: var(--b3-border-radius);
        padding: 10px 16px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s;
    }

    :global(.time-entry-form-dialog .save-button:hover) {
        background-color: var(--b3-theme-primary-light);
    }

    :global(.time-entry-form-dialog .cancel-button) {
        background-color: var(--b3-theme-background);
        color: var(--b3-theme-on-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        padding: 10px 16px;
        cursor: pointer;
        font-size: 14px;
        transition: background-color 0.2s;
    }

    :global(.time-entry-form-dialog .cancel-button:hover) {
        background-color: var(--b3-theme-surface);
    }

    /* 响应式布局 */
    @media (max-width: 768px) {
        .panel-header {
            flex-direction: column;
            align-items: flex-start;
            gap: 12px;
        }

        .panel-header-right {
            align-self: stretch;
        }

        .add-button {
            width: 100%;
            justify-content: center;
        }

        .desc-cell {
            max-width: 150px;
        }

        .desc-text {
            max-width: 150px;
            white-space: pre-wrap;
            line-height: 1.4;
        }
    }

    /* 为日期汇总添加额外样式 */
    .task-cell {
        white-space: nowrap;
    }

    .task-badge {
        display: inline-block;
        padding: 2px 8px;
        border-radius: 12px;
        font-size: 12px;
        background-color: var(--b3-theme-success-lighter);
        color: var(--b3-theme-success);
    }

    .task-info {
        margin-bottom: 16px;
        padding: 8px 12px;
        background-color: var(--b3-theme-success-lighter);
        border-radius: var(--b3-border-radius);
    }

    .task-name {
        font-weight: 500;
        color: var(--b3-theme-success);
    }

    .refresh-button {
        display: flex;
        align-items: center;
        gap: 6px;
        background-color: var(--b3-theme-background-light);
        color: var(--b3-theme-on-surface);
        border: 1px solid var(--b3-border-color);
        border-radius: var(--b3-border-radius);
        padding: 8px 12px;
        cursor: pointer;
        font-size: 14px;
        font-weight: 500;
        transition: background-color 0.2s;
        z-index: 2;
    }

    .refresh-button:hover {
        background-color: var(--b3-theme-surface);
    }
</style>