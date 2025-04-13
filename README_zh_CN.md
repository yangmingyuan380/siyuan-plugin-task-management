# 思源笔记任务管理插件

[English](./README.md)

一个功能强大的思源笔记任务管理插件，可以与JIRA和飞书集成，将项目任务同步到思源笔记数据库中。

![预览](preview.png)

## 主要功能

- **JIRA集成**：自动将JIRA问题同步到思源数据库
- **飞书集成**：连接飞书任务并在思源笔记中显示
- **灵活的字段映射**：自定义外部字段如何映射到思源数据库列
- **自定义颜色编码**：为状态和分类选项分配颜色，提高可视化效果
- **JavaScript表达式**：使用自定义JavaScript代码转换和提取数据

## 安装方法

1. 打开思源笔记市场
2. 搜索"任务管理"
3. 点击安装
4. 启用插件

## 配置说明

### JIRA配置

1. 进入插件设置
2. 选择"JIRA配置"选项卡
3. 输入您的JIRA服务器URL（例如：https://your-domain.atlassian.net）
4. 输入您的JIRA用户名（邮箱）
5. 输入您的JIRA API令牌（从[Atlassian账户设置](https://id.atlassian.com/manage-profile/security/api-tokens)生成）
6. 点击"编辑映射"配置字段映射

### 飞书配置

1. 进入插件设置
2. 选择"飞书配置"选项卡
3. 输入飞书API基础URL（默认：https://open.feishu.cn）
4. 需要在飞书项目中自建插件(本项目使用测试通道获取 token，不需要飞书项目空间安装该插件)，输入您的插件ID（从飞书开发者控制台获取）
5. 输入您的插件密钥
6. 添加您的用户标识(双击飞书项目个人头像获取)和空间ID
7. 点击"编辑映射"配置字段映射

### 字段映射

字段映射允许您指定外部服务字段如何映射到思源数据库列：

- **思源数据库列名**：思源数据库中的列名
- **外部字段路径**：访问外部服务API响应中字段的路径
- **数据类型**：文本、日期、单选（带颜色选项）和链接

#### 映射路径类型

##### 1. 简单点表示法
```
fields.summary
```

##### 2. JavaScript表达式
```
js: data.fields.timetracking ? `${data.fields.timetracking.originalEstimate || '0h'} / ${data.fields.timetracking.timeSpent || '0h'}` : '未设置'
```

#### JIRA字段路径示例：

- `fields.status.name` - 问题状态名称
- `fields.priority.name` - 优先级
- `fields.assignee.displayName` - 经办人名称
- `fields.summary` - 问题摘要
- `fields.updated` - 最后更新时间
- `js: data.fields.issuetype.name + ' #' + data.key` - 问题类型和编号组合
- `js: data.fields.customfield_10016 ? data.fields.customfield_10016.value : '无值'` - 带安全访问的自定义字段

#### 飞书字段路径示例：

- `name` - 任务名称
- `updated` - 最后更新时间
- `js: data.creator ? data.creator.name + ' (' + data.creator.email + ')' : '未知'` - 带邮箱的创建者

## JavaScript表达式

您可以通过在字段路径前添加`js:`前缀来使用JavaScript表达式进行复杂的数据转换。源数据可通过`data`变量获取。

### 示例用例：

1. **组合多个字段**：
   ```
   js: data.fields.summary + ' [' + data.fields.status.name + ']'
   ```

2. **条件格式化**：
   ```
   js: data.fields.priority.name === '高' ? '❗' + data.fields.priority.name : data.fields.priority.name
   ```

3. **日期格式化**：
   ```
   js: new Date(data.fields.updated).toLocaleDateString('zh-CN')
   ```

4. **计算**：
   ```
   js: data.fields.customfield_10024 ? Math.round(data.fields.customfield_10024 * 100) / 100 + '%' : '0%'
   ```

5. **默认值**：
   ```
   js: data.fields.assignee ? data.fields.assignee.displayName : '未分配'
   ```

### 安全说明：

- JavaScript表达式在沙箱环境中执行
- 访问浏览器API（如`window`、`document`）、Node.js模块和危险函数（如`eval`）被阻止
- 保持表达式简单并专注于数据转换

## 使用方法

1. 在思源笔记中创建数据库
2. 使用您的JIRA或飞书凭据配置插件
3. 设置字段映射以匹配您的数据库列
4. 使用插件获取和同步任务：
   - 在数据库中添加一行并创建一个ID列（文本类型）
   - 在ID列中输入JIRA或飞书工作项的ID/编号
   - 当ID输入完成并**失去焦点**时，插件会自动获取该任务的信息并填充到对应的映射字段
5. 您的外部任务将出现在思源数据库中，包含所有映射的字段

## 工作原理

本插件通过监听思源数据库的ID字段变化来触发任务同步：
1. 当在数据库的ID字段中输入任务ID并且失去焦点时，插件会检测到这一变化
2. 插件会根据配置的服务类型（JIRA或飞书）自动查询对应的任务信息
3. 查询到的任务信息会根据字段映射规则填充到数据库的其他列中

## 已知问题

- 初始配置可能需要一些尝试和错误来调整字段映射
- API速率限制可能会影响大型同步操作
- 自定义字段需要特定路径，可能需要通过API测试来确定
- 复杂的JavaScript表达式应该仔细测试

## 故障排除

如果遇到问题：

1. 检查您的凭据并确保API令牌有效
2. 先测试简单的路径来验证字段映射
3. 查看插件日志了解错误信息
4. 对于复杂的字段路径，使用调试模式查看完整的API响应结构
5. 对于JavaScript表达式，检查控制台获取错误信息

## 许可证

MIT © [Rick Yang](https://github.com/yangmingyuan380)
