import { fetchPost } from 'siyuan';
import { Logger, PathHelper } from '../utils';
import { ConfigManager } from '../conf';
import { FieldType } from '../types';

export class DatabaseService {
    private logger: Logger;
    private pathHelper: PathHelper;
    private configManager: ConfigManager;

    constructor(logger: Logger, configManager: ConfigManager) {
        this.logger = logger;
        this.pathHelper = new PathHelper(logger);
        this.configManager = configManager;
    }

    /**
     * 根据选项名称获取颜色ID
     * @param fieldName 字段名称
     * @param optionName 选项名称
     * @returns 分配的颜色ID
     */
    public getOptionColor(fieldName: string, optionName: string): string {
        const fixedOptionColors = this.configManager.getFixedOptionColors();
        const optionColors = this.configManager.getOptionColors();

        // 优先使用固定颜色映射
        if (fixedOptionColors[fieldName] && fixedOptionColors[fieldName][optionName]) {
            return fixedOptionColors[fieldName][optionName];
        }

        // 初始化该字段的颜色映射
        if (!optionColors[fieldName]) {
            optionColors[fieldName] = {};
        }

        // 如果已有颜色，直接返回
        if (optionColors[fieldName][optionName]) {
            return optionColors[fieldName][optionName];
        }

        // 颜色列表，与思源默认的选项颜色一致
        const colors = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14'];

        // 获取已使用的颜色
        const usedColors = Object.values(optionColors[fieldName]);

        // 找到未使用的颜色
        let availableColor = colors.find(color => !usedColors.includes(color));

        // 如果所有颜色都已用完，则循环使用
        if (!availableColor) {
            // 计算当前选项应该分配的颜色索引
            const index = Object.keys(optionColors[fieldName]).length % colors.length;
            availableColor = colors[index];
        }

        // 保存并返回颜色
        optionColors[fieldName][optionName] = availableColor;

        // 异步保存配置
        this.configManager.saveOptionColors().catch(err => {
            this.logger.error('保存选项颜色配置失败:', err);
        });

        return availableColor;
    }

    /**
     * 更新数据库行
     * @param rowId 行ID
     * @param issueData 问题数据
     * @param fieldMappings 字段映射
     * @param fieldTypes 字段类型
     */
    public async updateDatabaseRow(
        rowId: string,
        issueData: any,
        fieldMappings: Record<string, string>,
        fieldTypes: Record<string, string>
    ): Promise<void> {
        try {
            // 查找行元素和数据库容器元素
            const rowResult = this.findRowElement(rowId);
            if (!rowResult.rowElement) {
                return; // 错误已在findRowElement中记录
            }

            const { rowElement, avContainerElement } = rowResult;

            // 获取数据库ID
            const avId = this.findDatabaseId(rowElement, avContainerElement);
            if (!avId) {
                this.logger.error('无法获取数据库ID');
                return;
            }

            this.logger.debug('最终使用的数据库ID:', avId, '行ID:', rowId);

            // 构建事务请求体
            const doOperations = [];

            // 获取所有列的ID
            const columnsMap = this.getColumnsMap(avContainerElement, rowElement);
            if (columnsMap.size === 0) {
                this.logger.warn('无法获取列映射信息，无法更新');
                return;
            }

            // 准备要更新的字段数据
            const fieldsToUpdate = this.prepareFieldsToUpdate(issueData, fieldMappings);

            // 创建更新操作
            this.createUpdateOperations(fieldsToUpdate, fieldTypes, columnsMap, rowElement, rowId, avId, doOperations);

            if (doOperations.length === 0) {
                this.logger.warn('没有找到匹配的列，无法更新');
                return;
            }

            // 添加更新时间操作
            doOperations.push(this.createUpdateTimeOperation(rowId));

            // 执行事务
            await this.executeTransaction(doOperations, avId);
        } catch (error) {
            this.logger.error('更新数据库行失败:', error, error.stack);
        }
    }

    /**
     * 创建所有字段的更新操作
     * @param fieldsToUpdate 要更新的字段
     * @param fieldTypes 字段类型
     * @param columnsMap 列映射
     * @param rowElement 行元素
     * @param rowId 行ID
     * @param avId 数据库ID
     * @param doOperations 操作数组
     */
    private createUpdateOperations(
        fieldsToUpdate: Record<string, any>, 
        fieldTypes: Record<string, string>,
        columnsMap: Map<string, string>,
        rowElement: Element,
        rowId: string,
        avId: string,
        doOperations: any[]
    ): void {
        // 为每个字段创建一个操作
        for (const [fieldName, value] of Object.entries(fieldsToUpdate)) {
            const keyID = columnsMap.get(fieldName);
            if (!keyID) {
                this.logger.warn(`列 "${ fieldName }" 未找到`);
                continue;
            }

            // 在行中找到对应列ID的单元格
            const cellElement = rowElement.querySelector(`.av__cell[data-col-id="${ keyID }"]`);
            let cellID;

            if (!cellElement) {
                this.logger.warn(`找不到单元格元素 行=${ rowId }, 列=${ keyID }`);
                continue;
            }

            cellID = cellElement.getAttribute('data-id');
            this.logger.debug(`找到单元格 ${ fieldName }:`, cellElement);

            // 创建操作
            let operation;

            // 根据配置的字段类型创建不同类型的操作
            const fieldType = fieldTypes[fieldName] || FieldType.TEXT;

            if (fieldType === FieldType.DATE) {
                // 日期类型字段
                operation = this.createDateOperation(fieldName, value, cellID, keyID, rowId, avId);
            } else if (fieldType === FieldType.SELECT) {
                // 新增 单选类型
                const optionOperation = this.createOptionOperation(fieldName, value, keyID, avId);
                doOperations.push(optionOperation);
                
                // 选择 单选类型
                operation = this.createSelectOperation(fieldName, value, cellID, keyID, rowId, avId);
            } else if (fieldType === FieldType.URL) {
                // 链接类型字段
                operation = this.createLinkOperation(fieldName, value, cellID, keyID, rowId, avId);
            } else {
                // 普通文本字段
                operation = this.createTextOperation(fieldName, value, cellID, keyID, rowId, avId);
            }

            doOperations.push(operation);
        }
    }

    /**
     * 创建更新时间操作
     * @param rowId 行ID
     * @returns 更新时间操作
     */
    private createUpdateTimeOperation(rowId: string): any {
        return {
            action: 'doUpdateUpdated',
            id: rowId,
            data: Date.now().toString(),
        };
    }

    /**
     * 执行事务
     * @param doOperations 操作数组
     * @param avId 数据库ID
     */
    private async executeTransaction(doOperations: any[], avId: string): Promise<void> {
        // 创建事务
        const transaction = {
            doOperations: doOperations,
            undoOperations: [], // 简化处理，不提供撤销操作
        };

        // 发送事务请求
        try {
            await fetchPost('/api/transactions', {
                transactions: [transaction],
            }) as any;

            this.logger.info('更新数据库成功');

            // 刷新数据库视图
            await fetchPost('/api/ui/reloadAttributeView', { id: avId });
        } catch (error) {
            this.logger.error('发送事务请求失败', error);
        }
    }

    /**
     * 准备要更新的字段数据
     * @param issueData 问题数据
     * @param fieldMappings 字段映射
     * @returns 要更新的字段数据
     */
    private prepareFieldsToUpdate(issueData: any, fieldMappings: Record<string, string>): Record<string, any> {
        const fieldsToUpdate = {};

        // 从配置的字段映射中获取数据
        for (const [siyuanField, fieldPath] of Object.entries(fieldMappings)) {
            // 使用路径从JIRA或飞书数据中获取值
            const value = this.pathHelper.getValueByPath(issueData, fieldPath);
            if (value !== undefined) {
                fieldsToUpdate[siyuanField] = value;
            }
        }

        // 调试所有要更新的值
        this.logger.debug('要更新的字段:');
        Object.entries(fieldsToUpdate).forEach(([key, value]) => {
            this.logger.debug(`${ key }: ${ value }`);
        });

        return fieldsToUpdate;
    }

    /**
     * 获取列映射信息（列名到列ID的映射）
     * @param avContainerElement 数据库容器元素
     * @param rowElement 行元素
     * @returns 列名到列ID的映射
     */
    private getColumnsMap(avContainerElement: Element, rowElement: Element): Map<string, string> {
        const columnsMap = new Map<string, string>();
        
        // 获取所有列的ID
        const headerItems = avContainerElement.querySelectorAll('.av__row--header .av__cell');

        headerItems.forEach(header => {
            const name = header.querySelector('.av__celltext')?.textContent;
            const keyID = header.getAttribute('data-col-id');
            if (name && keyID) {
                columnsMap.set(name, keyID);
                this.logger.debug(`列映射: ${ name } => ${ keyID }`);
            }
        });

        // 直接从当前行获取所有单元格
        this.logger.debug('直接检查行内单元格:');
        const rowCells = rowElement.querySelectorAll('.av__cell');
        rowCells.forEach(cell => {
            const colId = cell.getAttribute('data-col-id');
            const cellId = cell.getAttribute('data-id');
            const cellText = cell.querySelector('.av__celltext')?.textContent;
            this.logger.debug(`行内单元格: colId=${ colId }, cellId=${ cellId }, text=${ cellText }`);
        });

        this.logger.debug('列映射:', [...columnsMap.entries()]);
        
        return columnsMap;
    }

    /**
     * 查找行元素和数据库容器元素
     * @param rowId 行ID
     * @returns 包含行元素和数据库容器元素的对象
     */
    private findRowElement(rowId: string): { rowElement?: Element, avContainerElement?: Element } {
        // 直接查找行元素
        const rowElement = document.querySelector(`.av__row[data-id="${ rowId }"]`);
        if (!rowElement) {
            this.logger.error('找不到行元素:', rowId);
            return {};
        }

        this.logger.debug('找到行元素:', rowElement);

        // 向上查找数据库容器元素
        const avContainerElement = rowElement.closest('.av__container');
        if (!avContainerElement) {
            this.logger.error('找不到数据库容器元素');
            return { rowElement };
        }

        this.logger.debug('找到数据库容器元素', avContainerElement);
        return { rowElement, avContainerElement };
    }

    /**
     * 根据行元素查找数据库ID
     * @param rowElement 行元素
     * @param avContainerElement 数据库容器元素
     * @returns 数据库ID或undefined
     */
    private findDatabaseId(rowElement: Element, avContainerElement: Element): string | undefined {
        let avId: string | undefined;

        // 尝试从DOM属性中获取
        const dataAttrView = rowElement.closest('[data-av-id]');
        if (dataAttrView) {
            avId = dataAttrView.getAttribute('data-av-id');
            this.logger.debug('从[data-av-id]获取数据库ID:', avId);
        }

        // 如果找不到，尝试从另一种结构获取
        if (!avId) {
            // 思源可能有不同的DOM结构版本
            // 尝试查找数据库的块ID，在DOM中某些地方可能存在
            const blockID = avContainerElement.getAttribute('data-node-id') ||
                avContainerElement.getAttribute('data-block-id');
            if (blockID) {
                this.logger.debug('使用数据库块ID作为avID:', blockID);
                avId = blockID;
            } else {
                // 尝试使用行所属的区块ID作为实验
                const blockElement = rowElement.closest('[data-node-id]');
                if (blockElement) {
                    avId = blockElement.getAttribute('data-node-id');
                    this.logger.debug('使用所属区块ID作为avID:', avId);
                } else {
                    // 尝试直接使用从视图中获取的ID
                    const viewID = avContainerElement.querySelector('.av__views [data-id]')?.getAttribute('data-id');
                    if (viewID) {
                        avId = viewID;
                        this.logger.debug('使用视图ID作为最后尝试:', viewID);
                    }
                }
            }
        }

        return avId;
    }

    /**
     * 创建日期类型的操作
     * @param fieldName 字段名称
     * @param value 字段值
     * @param cellID 单元格ID
     * @param keyID 列ID
     * @param rowId 行ID
     * @param avId 数据库ID
     * @returns 日期操作对象
     */
    private createDateOperation(fieldName: string, value: any, cellID: string, keyID: string, rowId: string, avId: string): any {
        const dateValue = new Date(String(value)).getTime();

        const operation = {
            action: 'updateAttrViewCell',
            id: cellID,
            avID: avId,
            keyID: keyID,
            rowID: rowId,
            data: {
                type: FieldType.DATE,
                date: {
                    content: dateValue,
                    isNotEmpty: true,
                    content2: null,
                    isNotEmpty2: false,
                    hasEndDate: false,
                    isNotTime: false,
                },
                id: cellID,
            },
        };
        this.logger.debug(`添加日期操作: ${ fieldName } = ${ value }, 时间戳=${ dateValue }`, operation);
        return operation;
    }

    /**
     * 创建选项操作（添加选项）
     * @param fieldName 字段名称
     * @param value 字段值
     * @param keyID 列ID
     * @param avId 数据库ID
     * @returns 选项操作对象
     */
    private createOptionOperation(fieldName: string, value: any, keyID: string, avId: string): any {
        const optionName = String(value);
        const colorId = this.getOptionColor(fieldName, optionName);

        const operation = {
            action: 'updateAttrViewColOptions',
            id: keyID,
            avID: avId,
            data: [
                {
                    color: colorId,
                    name: optionName,
                },
            ],
        };
        this.logger.debug(`添加选项: ${ fieldName } = ${ optionName }, 颜色=${ colorId }`);
        return operation;
    }

    /**
     * 创建选择类型的操作
     * @param fieldName 字段名称
     * @param value 字段值
     * @param cellID 单元格ID
     * @param keyID 列ID
     * @param rowId 行ID
     * @param avId 数据库ID
     * @returns 选择操作对象
     */
    private createSelectOperation(fieldName: string, value: any, cellID: string, keyID: string, rowId: string, avId: string): any {
        const optionName = String(value);
        const operation = {
            action: 'updateAttrViewCell',
            id: cellID,
            keyID: keyID,
            rowID: rowId,
            avID: avId,
            data: {
                type: FieldType.SELECT,
                id: cellID,
                mSelect: [
                    {
                        color: this.getOptionColor(fieldName, optionName),
                        content: optionName,
                    },
                ],
            },
        };
        this.logger.debug(`添加单选操作: ${ fieldName } = ${ optionName }`, operation);
        return operation;
    }

    /**
     * 创建文本类型的操作
     * @param fieldName 字段名称
     * @param value 字段值
     * @param cellID 单元格ID
     * @param keyID 列ID
     * @param rowId 行ID
     * @param avId 数据库ID
     * @returns 文本操作对象
     */
    private createTextOperation(fieldName: string, value: any, cellID: string, keyID: string, rowId: string, avId: string): any {
        const operation = {
            action: 'updateAttrViewCell',
            id: cellID,
            avID: avId,
            keyID: keyID,
            rowID: rowId,
            data: {
                type: FieldType.TEXT,
                text: {
                    content: String(value),
                },
                id: cellID,
            },
        };
        this.logger.debug(`添加文本操作: ${ fieldName } = ${ value }`, operation);
        return operation;
    }

    /**
     * 创建链接类型的操作   
     * @param fieldName 字段名称
     * @param value 字段值
     * @param cellID 单元格ID
     * @param keyID 列ID
     * @param rowId 行ID
     * @param avId 数据库ID
     * @returns 链接操作对象
     */
    private createLinkOperation(fieldName: string, value: any, cellID: string, keyID: string, rowId: string, avId: string): any {
        const operation = {
            action: 'updateAttrViewCell',
            id: cellID,
            avID: avId,
            keyID: keyID,
            rowID: rowId,
            data: {
                type: FieldType.URL,
                url: {
                    content: String(value),
                },
                id: cellID,
            },
        };
        this.logger.debug(`添加链接操作: ${ fieldName } = ${ value }`, operation);
        return operation;
    }
}