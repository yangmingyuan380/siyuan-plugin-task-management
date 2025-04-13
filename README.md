# SiYuan Task Management Plugin

[中文版](./README_zh_CN.md)

A powerful task management plugin for SiYuan Note that integrates with JIRA and Lark/Feishu to synchronize project tasks with SiYuan database.

![Preview](preview.png)

## Features

- **JIRA Integration**: Automatically sync JIRA issues to SiYuan database
- **Lark/Feishu Integration**: Connect with Lark/Feishu tasks and display them in SiYuan
- **Flexible Field Mapping**: Customize how external fields are mapped to SiYuan database columns
- **Custom Color Coding**: Assign colors to status and category options for better visualization
- **JavaScript Expressions**: Use custom JavaScript code to transform and extract data

## Installation

1. Open SiYuan marketplace
2. Search for "Task Management"
3. Click Install
4. Enable the plugin

## Configuration

### JIRA Configuration

1. Go to plugin settings
2. Select the "JIRA Configuration" tab
3. Enter your JIRA server URL (e.g., https://your-domain.atlassian.net)
4. Enter your JIRA username (email)
5. Enter your JIRA API token (generated from [Atlassian account settings](https://id.atlassian.com/manage-profile/security/api-tokens))
6. Configure field mappings by clicking "Edit Mappings"

### Lark/Feishu Configuration

1. Go to plugin settings
2. Select the "Lark Configuration" tab
3. Enter your Lark API base URL (default: https://open.feishu.cn)
4. You need to create a custom plugin in Lark (this project uses the test channel to get tokens, your Lark workspace doesn't need to install this plugin), enter your Plugin ID (from Lark developer console)
5. Enter your Plugin Secret
6. Add your User Key (double-click on your avatar in Lark project to get it) and Space ID
7. Configure field mappings by clicking "Edit Mappings"

### Field Mappings

Field mappings allow you to specify how external service fields are mapped to your SiYuan database columns:

- **SiYuan Column Name**: The column name in your SiYuan database
- **External Field Path**: The path to access the field in the external service API response
- **Data Type**: Text, Date, Select (with color options), or URL

#### Mapping Path Types

##### 1. Simple Dot Notation
```
fields.summary
```

##### 2. JavaScript Expression
```
js: data.fields.timetracking ? `${data.fields.timetracking.originalEstimate || '0h'} / ${data.fields.timetracking.timeSpent || '0h'}` : 'Not set'
```

#### Example JIRA Field Paths:

- `fields.status.name` - Issue status name
- `fields.priority.name` - Priority level
- `fields.assignee.displayName` - Assignee name
- `fields.summary` - Issue summary
- `fields.updated` - Last updated time
- `js: data.fields.issuetype.name + ' #' + data.key` - Issue type and key combined
- `js: data.fields.customfield_10016 ? data.fields.customfield_10016.value : 'No value'` - Custom field with safe access

#### Example Lark/Feishu Field Paths:

- `name` - Task name
- `updated` - Last updated time
- `js: data.creator ? data.creator.name + ' (' + data.creator.email + ')' : 'Unknown'` - Creator with email

## JavaScript Expressions

You can use JavaScript expressions for complex data transformations by prefixing your field path with `js:`. The source data is available as the `data` variable.

### Example Use Cases:

1. **Combining multiple fields**:
   ```
   js: data.fields.summary + ' [' + data.fields.status.name + ']'
   ```

2. **Conditional formatting**:
   ```
   js: data.fields.priority.name === 'High' ? '❗' + data.fields.priority.name : data.fields.priority.name
   ```

3. **Date formatting**:
   ```
   js: new Date(data.fields.updated).toLocaleDateString('en-US')
   ```

4. **Calculations**:
   ```
   js: data.fields.customfield_10024 ? Math.round(data.fields.customfield_10024 * 100) / 100 + '%' : '0%'
   ```

5. **Default values**:
   ```
   js: data.fields.assignee ? data.fields.assignee.displayName : 'Unassigned'
   ```

### Security Notes:

- JavaScript expressions are executed in a sandboxed environment
- Access to browser APIs like `window`, `document`, Node.js modules, and dangerous functions like `eval` is blocked
- Keep expressions simple and focused on data transformation

## Usage

1. Create a database in SiYuan
2. Configure the plugin with your JIRA or Lark/Feishu credentials
3. Set up field mappings to match your database columns
4. Use the plugin to fetch and sync tasks:
   - Add a row in the database and create an ID column (text type)
   - Enter JIRA or Feishu work item ID/number in the ID column
   - When ID input is complete and **loses focus**, the plugin will automatically fetch task information and populate the corresponding mapped fields
5. Your external tasks will appear in the SiYuan database with all mapped fields

## How It Works

This plugin monitors changes to the ID field in SiYuan database to trigger task synchronization:
1. When a task ID is entered in the database ID field and loses focus, the plugin detects this change
2. The plugin automatically queries the corresponding task information based on the configured service type (JIRA or Feishu)
3. The queried task information is populated into other columns in the database according to field mapping rules

## Known Issues

- The initial configuration may require some trial and error with field mappings
- API rate limits may affect large synchronization operations
- Custom fields require specific paths that might need to be determined through API testing
- Complex JavaScript expressions should be tested carefully

## Troubleshooting

If you encounter issues:

1. Check your credentials and ensure API tokens are valid
2. Verify field mappings by testing simpler paths first
3. Look at the plugin logs for error messages
4. For complex field paths, use the debug mode to see the complete API response structure
5. For JavaScript expressions, check the console for error messages

## License

MIT © [Rick Yang](https://github.com/yangmingyuan380)