# Jenkins API Tool

Node.js SDK for Jenkins RESTful API - 支持带参数构建、状态查询、产物下载。

## 安装

```bash
npm install
```

## 快速开始

### 1. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件:

```env
# 方式1: API Token 认证 (推荐)
JENKINS_URL=http://your-jenkins-server:8080
JENKINS_USERNAME=your_username
JENKINS_API_TOKEN=your_api_token

# 方式2: 用户名密码认证
# JENKINS_URL=http://your-jenkins-server:8080
# JENKINS_USERNAME=your_username
# JENKINS_PASSWORD=your_password
```

### 2. 使用 SDK

```typescript
import { JenkinsClient } from './src';

// 方式1: API Token 认证 (推荐)
const client = new JenkinsClient({
  url: process.env.JENKINS_URL,
  username: process.env.JENKINS_USERNAME,
  apiToken: process.env.JENKINS_API_TOKEN,
});

// 方式2: 用户名密码认证
const client = new JenkinsClient({
  url: process.env.JENKINS_URL,
  username: process.env.JENKINS_USERNAME,
  password: process.env.JENKINS_PASSWORD,
});

// 触发构建
const result = await client.build('my-job', {
  ENV: 'production',
  VERSION: '1.0.0',
});

// 查询构建状态
const status = await client.getStatus('my-job', result.queueId);

// 下载产物
await client.downloadAll('my-job', status.buildNumber, './dist');
```

## API 文档

### JenkinsClient

#### constructor(config)

初始化 Jenkins 客户端。

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| config.url | string | 是 | - | Jenkins 服务器地址 |
| config.username | string | 是 | - | 用户名 |
| config.password | string | 否* | - | 密码 (与 apiToken 二选一) |
| config.apiToken | string | 否* | - | API Token (与 password 二选一) |
| config.timeout | number | 否 | 30000 | 请求超时时间(ms) |
| config.retries | number | 否 | 0 | 重试次数 |
| config.retryDelay | number | 否 | 1000 | 重试延迟(ms) |
| config.logLevel | string | 否 | 'info' | 日志级别 (debug/info/warn/error/silent) |

#### build(jobName, params?, options?)

触发 Jenkins 构建。

| 参数 | 类型 | 说明 |
|------|------|------|
| jobName | string | Job 名称 |
| params | BuildParameters | 构建参数 (可选) |
| options | BuildOptions | 构建选项 (可选) |

**BuildParameters**:

```typescript
{
  STRING_PARAM: 'value',        // 字符串参数
  BOOL_PARAM: true,             // 布尔参数
  CHOICE_PARAM: 'option1',      // 选项参数
  FILE_PARAM: {                 // 文件参数
    type: 'file',
    path: './config.json'
  }
}
```

**BuildOptions**:

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| wait | boolean | false | 是否等待构建完成 |
| pollInterval | number | 5000 | 轮询间隔(ms) |
| maxWaitTime | number | 600000 | 最大等待时间(ms) |
| crumbIssuer | boolean | true | 是否启用 CSRF 保护 |

**返回值**:
- 异步模式: `BuildTriggerResult` (queueId, url, jobName)
- 同步模式: `BuildCompleteResult` (包含 buildNumber, status, duration, artifacts)

#### getStatus(jobName, buildNumber)

查询构建状态。

| 参数 | 类型 | 说明 |
|------|------|------|
| jobName | string | Job 名称 |
| buildNumber | number \| 'last' | 构建编号或 'last' |

**返回值**: `BuildStatusResult`

#### download(jobName, buildNumber, artifactPath, outputDir)

下载单个构建产物。

| 参数 | 类型 | 说明 |
|------|------|------|
| jobName | string | Job 名称 |
| buildNumber | number | 构建编号 |
| artifactPath | string | 产物相对路径 |
| outputDir | string | 本地输出目录 |

**返回值**: `DownloadResult`

#### downloadAll(jobName, buildNumber, outputDir)

下载所有构建产物。

| 参数 | 类型 | 说明 |
|------|------|------|
| jobName | string | Job 名称 |
| buildNumber | number | 构建编号 |
| outputDir | string | 本地输出目录 |

**返回值**: `DownloadAllResult`

#### getConsoleText(jobName, buildNumber)

获取构建控制台日志。

| 参数 | 类型 | 说明 |
|------|------|------|
| jobName | string | Job 名称 |
| buildNumber | number | 构建编号 |

**返回值**: `string` (日志内容)

#### verifyAuth()

验证 Jenkins 连接和认证是否有效。

**返回值**: 
```typescript
{
  authenticated: boolean;  // 是否认证成功
  user?: string;           // 当前认证用户
  version?: string;        // Jenkins 版本信息
  url: string;             // 服务器地址
}
```

## 示例

运行示例代码:

```bash
npx ts-node examples/01-basic-build.ts
npx ts-node examples/02-build-with-params.ts
npx ts-node examples/03-build-and-wait.ts
npx ts-node examples/04-check-status.ts
npx ts-node examples/05-download-artifacts.ts
npx ts-node examples/06-complete-flow.ts
npx ts-node examples/07-verify-auth.ts
```

## 错误处理

```typescript
import { JenkinsClient, BuildFailedError, TimeoutError, AuthenticationError } from './src';

try {
  await client.build('my-job', {}, { wait: true });
} catch (error) {
  if (error instanceof AuthenticationError) {
    console.error('认证失败');
  } else if (error instanceof BuildFailedError) {
    console.error(`构建失败: #${error.buildNumber}`);
  } else if (error instanceof TimeoutError) {
    console.error('操作超时');
  }
}
```

## 构建

```bash
npm run build
```

构建产物将输出到 `dist/` 目录。

## 类型检查

```bash
npm run type-check
```

## License

MIT
