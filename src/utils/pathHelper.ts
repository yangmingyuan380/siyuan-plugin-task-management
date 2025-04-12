import { Logger } from './logger';

/**
 * 路径处理工具类，用于从对象中按照路径表达式获取值
 */
export class PathHelper {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    /**
     * 根据路径从对象中获取值，支持复杂表达式
     * @param obj 要获取值的对象
     * @param path 路径表达式，如 "fields.status.name" 或 "current_nodes[0].name" 或 "fields.filter(it=>it.field_key==='priority').field_value.label"
     * @returns 路径对应的值，如果路径不存在则返回undefined
     */
    public getValueByPath(obj: any, path: string): any {
        // 处理JavaScript表达式
        if (path.startsWith('js:')) {
            return this.evaluateJsExpression(obj, path.substring(3));
        }
    }

    /**
     * 安全地执行JavaScript表达式获取数据
     * @param data 源数据对象
     * @param expression JavaScript表达式
     * @returns 表达式执行结果
     */
    private evaluateJsExpression(data: any, expression: string): any {
        try {
            // 移除表达式前后的空白
            expression = expression.trim();
            
            // 添加安全检查，防止执行危险代码
            if (expression.includes('window') || 
                expression.includes('document') || 
                expression.includes('eval') || 
                expression.includes('Function') ||
                expression.includes('require')) {
                this.logger.error('JavaScript表达式包含不安全的调用:', expression);
                return undefined;
            }
            
            // 使用Function构造函数创建一个新的函数
            // 只允许访问传入的data对象
            const func = new Function('data', `
                try {
                    return ${expression};
                } catch (e) {
                    console.error('JavaScript表达式执行错误:', e);
                    return undefined;
                }
            `);
            
            // 执行函数
            return func(data);
        } catch (error) {
            this.logger.error('执行JavaScript表达式失败:', expression, error);
            return undefined;
        }
    }
} 