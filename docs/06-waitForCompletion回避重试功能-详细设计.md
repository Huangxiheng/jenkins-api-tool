# JenkinsClient waitForCompletion 回避重试功能 - 详细设计

## 1. 概述

本文档是需求方案（[06-waitForCompletion回避重试功能.md](./06-waitForCompletion回避重试功能.md)）的详细设计文档。

### 1.1 确认的设计决策
- **重试间隔策略**：固定间隔，使用 `pollInterval` 配置值
- **重试范围**：仅处理超时错误（`ETIMEDOUT`、`ECONNABORTED`）
- **默认重试次数**：3 次

## 2. 模块设计

### 2.1 类型定义修改

**文件**: [src/types/index.ts](../src/types/index.ts)

在 `BuildOptions` 接口中新增配置项：

```typescript
export interface BuildOptions {
  /** 是否等待构建完成, 默认 false */
  wait?: boolean;
  /** 轮询间隔(ms), 默认 5000 */
  pollInterval?: number;
  /** 最大等待时间(ms), 默认 600000 (10分钟) */
  maxWaitTime?: number;
  /** 是否启用 CSRF 保护, 默认 true */
  crumbIssuer?: boolean;

  /**
   * waitForCompletion 网络超时重试次数
   * 当轮询过程中遇到 ETIMEDOUT/ECONNABORTED 错误时自动重试
   * @default 3
   */
  retryOnTimeout?: number;
}
```

### 2.2 BuildService 修改

**文件**: [src/services/build-service.ts](../src/services/build-service.ts)

#### 2.2.1 新增私有方法：判断超时错误

```typescript
/**
 * 判断错误是否为超时错误（可重试）
 * @param error - 捕获的错误对象
 * @returns 是否为超时错误
 */
private isTimeoutError(error: any): boolean {
  // 检查错误码
  if (error.code === 'ETIMEDOUT' || error.code === 'ECONNABORTED') {
    return true;
  }
  // 检查错误消息（兼容不同错误来源）
  const message = error.message?.toLowerCase() || '';
  return message.includes('etimedout') || message.includes('econnaborted');
}
```

#### 2.2.2 新增私有方法：带重试的请求执行

```typescript
/**
 * 带重试机制的请求执行器
 * @param requestFn - 要执行的请求函数
 * @param retryCount - 当前重试计数
 * @param maxRetries - 最大重试次数
 * @param pollInterval - 重试间隔
 * @returns 请求结果
 */
private async executeWithRetry<T>(
  requestFn: () => Promise<T>,
  retryCount: number,
  maxRetries: number,
  pollInterval: number
): Promise<T> {
  try {
    return await requestFn();
  } catch (error: any) {
    // 非超时错误，直接抛出
    if (!this.isTimeoutError(error)) {
      throw error;
    }

    // 达到最大重试次数
    if (retryCount >= maxRetries) {
      this.logger.error(`Max retries (${maxRetries}) reached, giving up`);
      throw error;
    }

    // 记录重试信息
    this.logger.warn(
      `Network timeout encountered (attempt ${retryCount + 1}/${maxRetries + 1}), ` +
      `retrying in ${pollInterval}ms...`
    );

    // 等待后重试
    await this.sleep(pollInterval);
    return this.executeWithRetry(requestFn, retryCount + 1, maxRetries, pollInterval);
  }
}
```

#### 2.2.3 修改 waitForCompletion 方法

```typescript
async waitForCompletion(
  jobName: string,
  queueId: number,
  options: { pollInterval: number; maxWaitTime: number; retryOnTimeout?: number }
): Promise<BuildCompleteResult> {
  const startTime = Date.now();
  const { pollInterval, maxWaitTime, retryOnTimeout = 3 } = options;
  let timeoutRetryCount = 0;  // 全局超时重试计数器

  this.logger.info(
    `Waiting for build to complete ` +
    `(poll interval: ${pollInterval}ms, max wait: ${formatDuration(maxWaitTime)}, ` +
    `retry on timeout: ${retryOnTimeout})`
  );

  // Step 1: Poll queue until executable is available
  let buildNumber: number | null = null;
  while (!buildNumber) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new TimeoutError(`Timed out waiting for build to start (max wait: ${formatDuration(maxWaitTime)})`);
    }

    this.logger.debug(`Checking queue item ${queueId}...`);

    try {
      const queueInfo = await this.statusService.getBuildNumberFromQueue(queueId);

      if (queueInfo && queueInfo.buildNumber) {
        buildNumber = queueInfo.buildNumber;
        this.logger.info(`Build started: #${buildNumber}`);
      } else {
        await this.sleep(pollInterval);
      }
    } catch (error: any) {
      // 处理超时重试
      if (this.isTimeoutError(error) && timeoutRetryCount < retryOnTimeout) {
        timeoutRetryCount++;
        this.logger.warn(
          `Network timeout in queue polling (attempt ${timeoutRetryCount}/${retryOnTimeout}), ` +
          `retrying in ${pollInterval}ms...`
        );
        await this.sleep(pollInterval);
        continue;
      }
      throw error;
    }
  }

  // Step 2: Poll build status until completion
  while (true) {
    if (Date.now() - startTime > maxWaitTime) {
      throw new TimeoutError(`Build timed out after ${formatDuration(maxWaitTime)}`);
    }

    try {
      const status = await this.statusService.getStatus(jobName, buildNumber);

      if (!status.building && status.status !== 'IN_PROGRESS') {
        this.logger.info(`Build completed: ${status.status} (${formatDuration(status.duration)})`);

        if (status.status === 'FAILURE') {
          throw new BuildFailedError(`Build #${buildNumber} failed`, buildNumber);
        }

        if (status.status === 'ABORTED') {
          throw new BuildFailedError(`Build #${buildNumber} was aborted`, buildNumber);
        }

        return {
          queueId,
          url: status.url,
          jobName,
          buildNumber: status.buildNumber,
          status: status.status,
          duration: status.duration,
          artifacts: status.artifacts,
        };
      }

      this.logger.debug(`Build #${buildNumber} still in progress...`);
      await this.sleep(pollInterval);
    } catch (error: any) {
      // 处理超时重试
      if (this.isTimeoutError(error) && timeoutRetryCount < retryOnTimeout) {
        timeoutRetryCount++;
        this.logger.warn(
          `Network timeout in status polling (attempt ${timeoutRetryCount}/${retryOnTimeout}), ` +
          `retrying in ${pollInterval}ms...`
        );
        await this.sleep(pollInterval);
        continue;
      }
      throw error;
    }
  }
}
```

### 2.3 JenkinsClient 修改

**文件**: [src/client/jenkins-client.ts](../src/client/jenkins-client.ts)

修改 `build` 方法，传递 `retryOnTimeout` 配置：

```typescript
async build(
  jobName: string,
  params?: BuildParameters,
  options?: BuildOptions
): Promise<BuildTriggerResult | BuildCompleteResult> {
  const buildOptions: Required<BuildOptions> = {
    wait: options?.wait || false,
    pollInterval: options?.pollInterval || 5000,
    maxWaitTime: options?.maxWaitTime || 600000,
    crumbIssuer: options?.crumbIssuer !== false,
    retryOnTimeout: options?.retryOnTimeout ?? 3,  // 新增
  };

  // Step 1: Trigger the build
  const triggerResult = await this.buildService.trigger(jobName, params, buildOptions);

  // Step 2: If wait mode, poll until completion
  if (buildOptions.wait) {
    return await this.buildService.waitForCompletion(
      jobName,
      triggerResult.queueId,
      {
        pollInterval: buildOptions.pollInterval,
        maxWaitTime: buildOptions.maxWaitTime,
        retryOnTimeout: buildOptions.retryOnTimeout,  // 新增
      }
    );
  }

  return triggerResult;
}
```

## 3. 执行流程

### 3.1 正常流程

```
用户调用 client.build(jobName, params, { wait: true, retryOnTimeout: 3 })
    ↓
JenkinsClient.build() 构建 buildOptions
    ↓
BuildService.trigger() 触发构建
    ↓
BuildService.waitForCompletion()
    ↓
┌─────────────────────────────────────────────────────┐
│ 队列轮询阶段                                          │
│   循环检查队列状态                                    │
│   → 成功：获取 buildNumber，进入状态轮询              │
│   → 超时错误：检查重试次数 → 重试/抛出异常            │
│   → 其他错误：直接抛出                                │
└─────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────┐
│ 状态轮询阶段                                          │
│   循环检查构建状态                                    │
│   → 完成：返回 BuildCompleteResult                   │
│   → 超时错误：检查重试次数 → 重试/抛出异常            │
│   → 其他错误：直接抛出                                │
└─────────────────────────────────────────────────────┘
```

### 3.2 重试流程

```
请求发送
    ↓
捕获错误
    ↓
判断是否为超时错误 (isTimeoutError)
    ↓ 是
检查重试计数 < retryOnTimeout
    ↓ 是
记录日志: "Network timeout encountered..."
    ↓
等待 pollInterval
    ↓
重试请求 (计数+1)
    ↓
┌───────────────────────────────────────┐
│ 成功 → 返回结果                        │
│ 失败 → 重复上述流程                    │
│ 达到重试上限 → 抛出原始错误             │
└───────────────────────────────────────┘
```

## 4. API 变更

### 4.1 新增配置项

| 配置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `retryOnTimeout` | `number` | `3` | 超时重试次数，0 表示不重试 |

### 4.2 使用示例

```typescript
import { JenkinsClient } from './client/jenkins-client';

const client = new JenkinsClient({
  url: 'https://jenkins.example.com',
  username: 'admin',
  apiToken: 'your-api-token',
});

// 基本用法（使用默认重试次数 3）
const result1 = await client.build('my-job', {}, {
  wait: true,
});

// 自定义重试次数
const result2 = await client.build('my-job', {}, {
  wait: true,
  pollInterval: 5000,
  maxWaitTime: 600000,
  retryOnTimeout: 5,  // 最多重试 5 次
});

// 禁用重试
const result3 = await client.build('my-job', {}, {
  wait: true,
  retryOnTimeout: 0,  // 不重试
});
```

## 5. 文件修改清单

| 文件 | 修改内容 |
|------|----------|
| [src/types/index.ts](../src/types/index.ts) | `BuildOptions` 接口新增 `retryOnTimeout` 字段 |
| [src/services/build-service.ts](../src/services/build-service.ts) | 新增 `isTimeoutError` 方法、修改 `waitForCompletion` 方法 |
| [src/client/jenkins-client.ts](../src/client/jenkins-client.ts) | `build` 方法传递 `retryOnTimeout` 配置 |

## 6. 测试要点

1. **正常流程测试**：确保不改变现有行为
2. **超时重试测试**：模拟 ETIMEDOUT 错误，验证重试逻辑
3. **重试次数上限测试**：验证达到上限后抛出原始错误
4. **非超时错误测试**：验证其他错误不触发重试
5. **配置传递测试**：验证配置正确传递到 BuildService

---

**文档版本**: v1.0
**创建时间**: 2026-07-16
**状态**: 已实现