import { showMessage } from 'siyuan';
import * as SiYuanAPI from '../api';
import type { Logger } from '../utils';
import type { JiraService, LarkService } from '../services';

// 工时记录表单数据
export interface TimeEntry {
  id: string;
  startTime: string;
  endTime: string;
  description: string;
  timeSpent: string;
  nodeId: string;
  nodeName: string;
  author?: string;
  avatar?: string;
  workItemId?: string;    // 工作项ID
  workItemEntityName?: string;  // 工作项名称
  workItemEntityId?: string; // 工作项实体ID
}

// 工作项节点
export interface WorkItemNode {
  nodeId: string;
  nodeName: string;
  hasNext: boolean;
}

// 工具函数 - 格式化日期
export function formatDate(date: Date): string {
  // 获取当前日期并设置时间为东八区早8点
  const currentDate = new Date(date);
  currentDate.setHours(8, 0, 0, 0); // 设置为8:00:00
  
  // 返回日期部分，不包含时分
  const yyyy = currentDate.getFullYear();
  const mm = String(currentDate.getMonth() + 1).padStart(2, '0');
  const dd = String(currentDate.getDate()).padStart(2, '0');
  return `${ yyyy }-${ mm }-${ dd }`;
}

// 格式化日期用于编辑
export function formatDateForEdit(dateStr: string): string {
  try {
    // 从日期字符串创建日期对象
    const date = new Date(dateStr);
    return formatDate(date);
  } catch (e) {
    return formatDate(new Date());
  }
}

// 格式化日期用于文件路径
export function formatDateForFilePath(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  return `${ yyyy }/${ mm }`;
}

// 格式化日期用于文件名
export function formatDateForFileName(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${ yyyy }-${ mm }-${ dd }`;
}

// 格式化JIRA工时记录
export function formatJiraWorklog(worklog: any): TimeEntry {
  return {
    id: worklog.id,
    author: worklog.author?.displayName || '未知',
    startTime: worklog.started || new Date().toISOString(),
    endTime: '',
    timeSpent: worklog.timeSpent || '0h',
    description: worklog.comment || '无描述',
    nodeId: '',
    nodeName: '',
  };
}

// 计算总工时
export function calculateTotalTime(timeEntries: TimeEntry[]): string {
  let totalHours = 0;
  let totalMinutes = 0;
  
  timeEntries.forEach(entry => {
    const hoursMatch = entry.timeSpent.match(/(\d+)h/);
    const minutesMatch = entry.timeSpent.match(/(\d+)m/);
    
    if (hoursMatch) {
      totalHours += parseInt(hoursMatch[1]);
    }
    
    if (minutesMatch) {
      totalMinutes += parseInt(minutesMatch[1]);
    }
  });
  
  // 转换分钟到小时
  totalHours += Math.floor(totalMinutes / 60);
  totalMinutes = totalMinutes % 60;
  
  let result = '';
  if (totalHours > 0) {
    result += `${ totalHours }h `;
  }
  if (totalMinutes > 0) {
    result += `${ totalMinutes }m`;
  }
  
  return result.trim() || '0h';
}

// 加载工时记录
export async function loadTimeEntries(
  type: 'jira' | 'lark',
  issueKey: string,
  jiraService: JiraService,
  larkService: LarkService,
  logger: Logger
): Promise<{ timeEntries: TimeEntry[], error: string }> {
  let timeEntries: TimeEntry[] = [];
  let error = '';
  
  try {
    let newEntries = [];
    
    if (type === 'jira') {
      const worklogData = await jiraService.fetchWorklog(issueKey);
      if (worklogData && worklogData.worklogs) {
        newEntries = worklogData.worklogs.map(formatJiraWorklog);
      } else {
        newEntries = [];
        logger.debug('JIRA工时列表为空或格式不正确', worklogData);
      }
    } else if (type === 'lark') {
      const worklogData = await larkService.fetchWorklog(issueKey);
      
      // 对飞书返回的数据进行处理
      if (worklogData && Array.isArray(worklogData.items)) {
        logger.debug('获取到原始飞书工时数据:', worklogData.items);
        newEntries = worklogData.items;
      } else {
        newEntries = [];
        logger.debug('飞书工时列表为空或格式不正确', worklogData);
      }
    }
    
    // 排序工时记录，最新的在前面
    newEntries.sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
    
    timeEntries = [...newEntries];
    logger.debug(`加载了 ${ timeEntries.length } 条工时记录:`, timeEntries);
  } catch (err) {
    error = `加载工时记录失败: ${ err.message }`;
    logger.error('加载工时记录失败:', err);
    timeEntries = [];
  }
  
  return { timeEntries, error };
}

// 加载工作项节点列表
export async function loadNodeList(
  type: 'jira' | 'lark',
  issueKey: string,
  larkService: LarkService,
  logger: Logger
): Promise<{ nodeList: WorkItemNode[], error: string }> {
  let nodeList: WorkItemNode[] = [];
  let error = '';
  
  if (type !== 'lark') return { nodeList, error };
  
  try {
    // 获取飞书工作项信息
    const issueInfo = await larkService.fetchLarkIssue(issueKey);
    if (!issueInfo) {
      throw new Error(`未找到工作项: ${ issueKey }`);
    }
    
    // 获取当前日期
    const today = new Date().toISOString().split('T')[0];
    
    // 获取节点列表
    nodeList = await larkService.getWorkItemNodes(
      issueInfo.work_item_type_key,
      issueInfo.id,
      today,
    );
    
    logger.debug(`加载了 ${ nodeList.length } 个工作项节点`);
  } catch (err) {
    error = `加载节点列表失败: ${ err.message }`;
    logger.error('加载节点列表失败:', err);
    nodeList = [];
  }
  
  return { nodeList, error };
}

// 验证工时记录
export function validateTimeEntry(entry: TimeEntry): void {
  if (!entry.startTime) {
    throw new Error('开始时间不能为空');
  }
  
  const timeSpentPattern = /^(\d+h)?\s*(\d+m)?$/;
  if (!timeSpentPattern.test(entry.timeSpent.trim())) {
    throw new Error('工时格式无效，请使用如 "1h 30m" 的格式');
  }
  
  if (!entry.description || entry.description.trim().length === 0) {
    throw new Error('工作描述不能为空');
  }
}

// 将工时记录添加到Daily Note
export async function appendToDailyNote(timeEntry: TimeEntry, docId: string, issueKey: string, logger: Logger): Promise<void> {
  const CUSTOM_ATTR_NAME = 'custom-workLogId';
  try {
    // 准备工时记录的唯一标识符
    const workLogId = timeEntry.id || `temp-${ Date.now() }`;
    
    // 准备写入内容
    const content = `- ((${ docId } '${ issueKey }')) ${ timeEntry.timeSpent } ${ timeEntry.description }`.trim();
    
    // 获取默认笔记本
    const { notebooks } = await SiYuanAPI.lsNotebooks();
    if (!notebooks || notebooks.length === 0) {
      throw new Error('无法获取笔记本列表');
    }
    
    // 找到第一个未关闭的笔记本
    const notebook = notebooks.find(nb => !nb.closed);
    if (!notebook) {
      throw new Error('没有可用的笔记本');
    }
    
    // 构建日记路径
    const date = new Date(timeEntry.startTime);
    let dailyNotePath = `/daily note/${ formatDateForFilePath(date) }/${ formatDateForFileName(date) }`;
    
    // 尝试获取已有日记Id
    const noteBlockIds: any = await SiYuanAPI.getIDsByHPath(notebook.id, dailyNotePath);
    let noteId = noteBlockIds[0];
    
    if (!noteId) {
      noteId = await SiYuanAPI.createDocWithMd(notebook.id, dailyNotePath, content);
      logger.info('已创建新日记');
    }
    
    // 尝试查找是否已存在相同ID的工时记录
    const childBlocks = await SiYuanAPI.getChildBlocks(noteId);

    for (const block of childBlocks) {
      const blockAttrs = await SiYuanAPI.getBlockAttrs(block.id);
      const blockWorkLogId = blockAttrs[CUSTOM_ATTR_NAME];
      if (`${workLogId}` === blockWorkLogId) {
        logger.info(`工时ID ${ workLogId } 已存在于日记中，将尝试更新`);
        // 更新该块内容
        await SiYuanAPI.updateBlock('markdown', content, block.id);
        logger.info('工时记录已在日记中更新');
        return;
      }
    }
    
    // 如果没找到或无法更新，则追加新内容
    const resDoOperations = await SiYuanAPI.insertBlock('markdown', content, undefined, undefined, noteId);
    
    await SiYuanAPI.setBlockAttrs(resDoOperations[0].doOperations[0].id, { [CUSTOM_ATTR_NAME]: `${workLogId}` });
    
    logger.info('工时记录已追加到日记中');
    return;
  } catch (err) {
    logger.error('添加工时记录到日记失败:', err);
  }
}

// 从日记中删除工时记录
export async function removeFromDailyNote(workLogId: string, logger: Logger): Promise<boolean> {
  const CUSTOM_ATTR_NAME = 'custom-workLogId';
  try {
    // 获取所有笔记本
    const { notebooks } = await SiYuanAPI.lsNotebooks();
    if (!notebooks || notebooks.length === 0) {
      logger.warn('无法获取笔记本列表');
      return false;
    }
    
    // 遍历所有未关闭的笔记本
    for (const notebook of notebooks.filter(nb => !nb.closed)) {
      try {
        // 查询包含指定工时ID属性的块
        const sql = `SELECT * FROM blocks 
                    WHERE type = 'l' AND id IN 
                    (SELECT block_id FROM attributes 
                     WHERE name = '${CUSTOM_ATTR_NAME}' 
                     AND value = '${workLogId}')`;
        
        const blocks = await SiYuanAPI.sql(sql);
        
        if (blocks && blocks.length > 0) {
          // 找到匹配的块，删除它
          for (const block of blocks) {
            await SiYuanAPI.deleteBlock(block.id);
            logger.info(`已从日记中删除工时记录 ID: ${workLogId}`);
          }
          return true;
        }
      } catch (err) {
        logger.warn(`在笔记本 ${notebook.name} 中搜索工时记录失败:`, err);
        // 继续下一个笔记本
      }
    }
    
    logger.info(`未在日记中找到工时记录 ID: ${workLogId}`);
    return false;
  } catch (err) {
    logger.error('从日记中删除工时记录失败:', err);
    return false;
  }
}

// 删除工时记录
export async function deleteTimeEntry(
  index: number,
  timeEntries: TimeEntry[],
  type: 'jira' | 'lark',
  issueKey: string,
  jiraService: JiraService,
  larkService: LarkService,
  logger: Logger,
  showConfirm: boolean = true
): Promise<boolean> {
  if (showConfirm && !confirm('确定要删除这条工时记录吗？')) {
    return false;
  }
  
  let error = '';
  
  try {
    const entry = timeEntries[index];
    let result = false;
    
    if (type === 'jira' && entry.id) {
      const response = await jiraService.deleteWorklog(issueKey, entry.id);
      result = response && response.success === true;
    } else if (type === 'lark' && entry.id) {
      const response = await larkService.deleteWorklog(issueKey, entry.id);
      result = response && response.success === true;
    }
    
    if (result) {
      if (showConfirm) {
        showMessage('工时记录已删除', 3000);
      }
      return true;
    } else {
      error = '删除工时记录失败';
      if (showConfirm) {
        showMessage('删除失败', 3000, 'error');
      }
      return false;
    }
  } catch (err) {
    error = `删除工时记录失败: ${ err.message }`;
    logger.error('删除工时记录失败:', err);
    if (showConfirm) {
      showMessage(`删除失败: ${ err.message }`, 3000, 'error');
    }
    return false;
  }
}

// 更新工时记录
export async function updateTimeEntry(
  entryId: string,
  timeEntry: TimeEntry,
  type: 'jira' | 'lark',
  issueKey: string,
  jiraService: JiraService,
  larkService: LarkService,
  logger: Logger
): Promise<boolean> {
  try {
    // 根据类型选择对应的服务
    let response;
    
    if (type === 'jira' && entryId) {
      response = await jiraService.updateWorklog(issueKey, entryId, timeEntry);
    } else if (type === 'lark' && entryId) {
      response = await larkService.updateWorklog(issueKey, entryId, timeEntry);
    } else {
      throw new Error('缺少必要的参数或不支持的任务类型');
    }
    
    // 检查结果
    const result = response && response.success === true;
    
    if (result) {
      logger.info(`工时记录 ${entryId} 已更新`);
      return true;
    } else {
      throw new Error('服务器未能成功更新工时记录');
    }
  } catch (err) {
    logger.error(`更新工时记录失败: ${err.message}`, err);
    throw err;
  }
}