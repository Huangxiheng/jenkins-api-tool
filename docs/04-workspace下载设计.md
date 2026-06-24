# Jenkins API Tool - Workspace 下载功能设计

## 1. 需求背景

### 1.1 问题描述
当前下载功能只支持从 Jenkins 的 `/artifact/` 路径下载归档产物。但部分 Jenkins Job 未使用 "Archive Artifacts" 功能，产物直接生成在 workspace 目录下，如：

```
http://223.223.178.68:2004/jenkins-122/job/server/job/pex/job/pty-pcx/ws/pty-pcx/
```

### 1.2 解决方案
同时支持两种下载模式：
1. **Artifact 模式**：从 `/job/{jobName}/{buildNumber}/artifact/` 下载（现有功能）
2. **Workspace 模式**：从 `/job/{jobName}[/buildNumber]/ws/` 下载（新增功能）

## 2. Jenkins API 对接

### 2.1 Workspace 浏览 API

Jenkins 提供 workspace 浏览 API（需要 Jenkins 管理员启用 Workspace 浏览权限）：

**列出 workspace 文件：**
```
GET /job/{jobName}/{buildNumber}/ws/{directoryPath}
```
或（不指定 buildNumber 时访问当前 workspace）：
```
GET /job/{jobName}/ws/{directoryPath}
```

返回 HTML 格式的文件列表。

**下载 workspace 文件：**
```
GET /job/{jobName}/{buildNumber}/ws/{filePath}
```
或：
```
GET /job/{jobName}/ws/{filePath}
```

### 2.2 Artifact API（现有）

**列出归档产物：**
```
GET /job/{jobName}/{buildNumber}/api/json
```

返回的 `artifacts` 字段包含归档文件列表。

**下载归档产物：**
```
GET /job/{jobName}/{buildNumber}/artifact/{relativePath}
```

## 3. 类型定义

### 3.1 下载模式

```typescript
// 下载模式
export type DownloadSource = 'artifact' | 'workspace';
```

### 3.2 下载选项

```typescript
// 下载选项
export interface DownloadOptions {
  /** 下载源: 'artifact'(归档产物) 或 'workspace'(工作空间), 默认 'artifact' */
  source?: DownloadSource;
  /** workspace 基础路径 (仅当 source='workspace' 时有效), 如 'pty-pcx' */
  workspacePath?: string;
  /** 文件过滤模式 (支持 glob), 如 '*.jar', '**/*.zip' */
  pattern?: string;
  /** 最大下载深度 (仅当 source='workspace' 时有效), 默认 10 */
  maxDepth?: number;
}
```

### 3.3 Workspace 文件信息

```typescript
// Workspace 文件信息
export interface WorkspaceFileInfo {
  /** 文件名 */
  name: string;
  /** 相对路径 (相对于 workspacePath) */
  relativePath: string;
  /** 是否为目录 */
  isDirectory: boolean;
  /** 文件大小(字节), 可能为空 */
  size?: number;
  /** 最后修改时间戳 */
  timestamp?: number;
}
```

### 3.4 下载结果

```typescript
// 单个下载结果
export interface DownloadResult {
  fileName: string;
  localPath: string;
  size: number;
  duration: number;
  source: DownloadSource;
}

// 批量下载结果
export interface DownloadAllResult {
  total: number;
  success: number;
  failed: number;
  results: DownloadResult[];
}
```

## 4. 核心流程

### 4.1 Workspace 下载单个文件

```
client.download('server/job/pex/job/pty-pcx', buildNumber, 'pty-pcx/dist/app.jar', './dist', { source: 'workspace' })
    │
    ├─ 1. 构建下载 URL
    │      └─ /job/server/job/pex/job/pty-pcx/{buildNumber}/ws/pty-pcx/dist/app.jar
    │         (无 buildNumber 时: /job/server/job/pex/job/pty-pcx/ws/pty-pcx/dist/app.jar)
    │
    ├─ 2. 流式下载文件
    │      └─ 显示进度
    │
    ├─ 3. 保存到本地
    │      └─ ./dist/app.jar
    │
    └─ 4. 返回 DownloadResult
```

### 4.2 Workspace 批量下载

```
client.downloadAll('server/job/pex/job/pty-pcx', buildNumber, './dist', { source: 'workspace', workspacePath: 'pty-pcx', pattern: '*.jar' })
    │
    ├─ 1. 获取 workspace 文件列表
    │      └─ GET /job/server/job/pex/job/pty-pcx/{buildNumber}/ws/pty-pcx/
    │      └─ 解析 HTML 获取文件列表
    │
    ├─ 2. 递归扫描子目录 (最大深度 maxDepth)
    │
    ├─ 3. 根据 pattern 过滤文件
    │
    ├─ 4. 遍历下载每个文件
    │      └─ 保持目录结构
    │
    └─ 5. 返回 DownloadAllResult
```

## 5. 实现细节

### 5.1 http-client.ts 方法

```typescript
// 获取 workspace 文件列表
async getWorkspaceFileList(
  jobName: string,
  buildNumber: number | undefined,
  workspacePath?: string
): Promise<WorkspaceFileInfo[]>;
```

内部通过请求 Jenkins 的 `/job/{jobName}[/buildNumber]/ws/{path}` 返回 HTML，然后解析 `<a>` 标签获取文件列表。

### 5.2 download-service.ts 方法

```typescript
// 从 workspace 下载单个文件
async downloadFromWorkspace(
  jobName: string,
  buildNumber: number | undefined,
  filePath: string,
  outputDir: string
): Promise<DownloadResult>;

// 从 workspace 下载所有匹配文件
async downloadAllFromWorkspace(
  jobName: string,
  buildNumber: number | undefined,
  outputDir: string,
  options: DownloadOptions
): Promise<DownloadAllResult>;

// 递归列出 workspace 文件
private async listWorkspaceFiles(
  jobName: string,
  buildNumber: number | undefined,
  basePath: string,
  maxDepth: number,
  currentDepth: number
): Promise<WorkspaceFileInfo[]>;
```

### 5.3 jenkins-client.ts 对外 API

```typescript
// 下载单个产物/文件
async download(
  jobName: string,
  buildNumber: number | undefined,  // 可选，不传则使用当前 workspace
  filePath: string,
  outputDir: string,
  options?: DownloadOptions
): Promise<DownloadResult>;

// 下载所有产物/文件
async downloadAll(
  jobName: string,
  buildNumber: number | undefined,  // 可选，不传则使用当前 workspace
  outputDir: string,
  options?: DownloadOptions
): Promise<DownloadAllResult>;
```

**说明**：
- `buildNumber` 为 `undefined` 时，访问当前 workspace（最新的构建工作空间）
- Artifact 模式必须传 `buildNumber`，否则会抛出 `Error`
- Workspace 模式 `buildNumber` 可选

## 6. 使用示例

### 6.1 下载 workspace 单个文件（指定 buildNumber）

```typescript
import { JenkinsClient } from 'jenkins-api-tool';

const client = new JenkinsClient({
  url: 'http://your-jenkins-server',
  username: 'your-username',
  password: 'your-password',
  logLevel: 'info',
});

const result = await client.download(
  'server/job/pex/job/pty-pcx',
  1107,                        // 指定构建编号
  'pty-pcx/pcx-4.0.1.1284-ENT-RELEASE.zip',  // workspace 内的相对路径
  './downloads',
  { source: 'workspace' }
);

console.log(`下载成功: ${result.fileName} (${result.size} 字节)`);
console.log(`本地路径: ${result.localPath}`);
console.log(`下载耗时: ${result.duration}ms`);
```

### 6.2 下载 workspace 单个文件（不指定 buildNumber，使用最新 workspace）

```typescript
const result = await client.download(
  'server/job/pex/job/pty-pcx',
  undefined,                   // 不指定 buildNumber，使用当前 workspace
  'pty-pcx/pcx-4.0.1.1284-ENT-RELEASE.zip',
  './downloads',
  { source: 'workspace' }
);
```

### 6.3 下载 workspace 所有 jar 文件

```typescript
const result = await client.downloadAll(
  'server/job/pex/job/pty-pcx',
  1107,
  './downloads',
  {
    source: 'workspace',
    workspacePath: 'pty-pcx',
    pattern: '*.jar',
    maxDepth: 10,
  }
);
console.log(`下载完成: ${result.success}/${result.total} 成功`);
for (const file of result.results) {
  console.log(`  - ${file.fileName} (${file.size} 字节)`);
}
```

### 6.4 下载 workspace 所有文件（保持目录结构）

```typescript
const result = await client.downloadAll(
  'server/job/pex/job/pty-pcx',
  undefined,                   // 使用当前 workspace
  './downloads/workspace',
  {
    source: 'workspace',
    workspacePath: 'pty-pcx',
    maxDepth: 10,
  }
);
console.log(`下载完成: ${result.success}/${result.total} 成功`);
for (const file of result.results) {
  console.log(`  - ${file.relativePath} (${file.size} 字节)`);
}
```

### 6.5 下载归档产物（保持向后兼容）

```typescript
// 默认使用 artifact 模式
const result = await client.downloadAll(
  'my-job',
  123,
  './downloads'
);

// 显式指定 artifact 模式
const result2 = await client.downloadAll(
  'my-job',
  123,
  './downloads',
  { source: 'artifact' }
);
```

## 7. 兼容性说明

### 7.1 向后兼容
- 默认 `source: 'artifact'`，现有代码无需修改
- 不传 `options` 时行为与之前完全一致

### 7.2 Jenkins 权限要求
- **Artifact 模式**：需要 Job 读取权限
- **Workspace 模式**：需要 Job 读取权限 + Workspace 浏览权限（需在 Jenkins 全局安全配置中启用）

### 7.3 降级策略
如果 workspace 浏览未启用，API 会返回 403 或 404，应给出明确错误提示。

### 7.4 buildNumber 说明
- **Artifact 模式**：必须指定 `buildNumber`，否则抛出错误
- **Workspace 模式**：`buildNumber` 可选
  - 指定时：下载指定构建的 workspace
  - 不指定时（`undefined`）：下载当前最新的 workspace（通常是最后一次构建的工作空间）

## 8. 文件清单

### 已修改的文件：
1. `src/types/index.ts` - 添加 DownloadOptions 和 WorkspaceFileInfo 类型
2. `src/services/http-client.ts` - 添加 getWorkspaceFileList、parseWorkspaceHtml 方法
3. `src/services/download-service.ts` - 添加 workspace 下载方法
4. `src/client/jenkins-client.ts` - 修改 download/downloadAll 方法签名，buildNumber 改为可选

### 示例文件：
1. `examples/05-download-artifacts.ts` - Artifact 下载示例
2. `examples/07-download-workspace.ts` - Workspace 下载示例
