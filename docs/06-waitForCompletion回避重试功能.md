# JenkinsClient waitForCompletion 回避重试功能需求方案

## 1. 背景与问题

### 1.1 问题描述
JenkinsClient 在与 Jenkins 服务器通信时，可能会出现连接超时问题（`connect ETIMEDOUT`）。这类网络层面的临时故障在长时间轮询场景下更容易发生。

### 1.2 现状分析
当前代码结构：
- [JenkinsClient](file:///c:/IDEA/project/jenkins-api-tool/src/client/jenkins-client.ts) - 对外暴露的客户端类
- [BuildService](file:///c:/IDEA/project/jenkins-api-tool/src/services/build-service.ts) - 构建服务，包含 `trigger` 和 `waitForCompletion` 方法
- [HttpClient](file:///c:/IDEA/project/jenkins-api-tool/src/services/http-client.ts) - HTTP 请求封装，已有超时处理但无重试机制

当前 `waitForCompletion` 方法（第 65-126 行）：
```typescript
async waitForCompletion(
  jobName: string,
  queueId: number,
  options: { pollInterval: number; maxWaitTime: number }
): Promise<BuildCompleteResult>
```

该方法包含两个轮询阶段：
1. **队列轮询**：等待构建从队列中开始执行
2. **状态轮询**：轮询构建状态直到完成

这两个阶段都可能因为网络问题导致 `ETIMEDOUT` 错误，当前没有重试机制。

## 2. 需求分析

### 2.1 核心需求
为 `waitForCompletion` 方法添加回避重试（Retry with Backoff）功能：
- 当遇到网络超时错误（`ETIMEDOUT`）时自动重试
- 支持配置重试次数
- 支持配置重试间隔策略

### 2.2 需求细化
| 需求项 | 说明 | 默认值 |
|--------|------|--------|
| 重试触发条件 | 仅针对网络超时错误（`ETIMEDOUT`、`ECONNABORTED`）进行重试 | - |
| 重试次数 | 可配置的最大重试次数 | 3 |
| 重试间隔 | 每次重试的等待时间 | 使用 `pollInterval` |
| 日志记录 | 记录重试信息 | - |

### 2.3 非需求范围
- `trigger` 方法**不需要**回避重试功能（用户明确指出）
- 其他非超时类错误（如 401、403、404）不触发重试

## 3. 方案设计

### 3.1 配置扩展
在 `BuildOptions` 接口中新增重试相关配置：

```typescript
export interface BuildOptions {
  // 现有配置...
  wait?: boolean;
  pollInterval?: number;
  maxWaitTime?: number;
  crumbIssuer?: boolean;

  // 新增配置
  /** waitForCompletion 网络超时重试次数，默认 3 */
  retryOnTimeout?: number;
}
```

### 3.2 影响范围
| 文件 | 改动类型 | 说明 |
|------|----------|------|
| `src/types/index.ts` | 修改 | 新增 `retryOnTimeout` 配置项 |
| `src/services/build-service.ts` | 修改 | `waitForCompletion` 方法添加重试逻辑 |
| `src/client/jenkins-client.ts` | 修改 | 传递新配置项 |

### 3.3 实现要点

1. **识别超时错误**
   - 通过 `error.code === 'ETIMEDOUT'` 或 `error.code === 'ECONNABORTED'` 判断
   - 或通过错误消息匹配超时特征

2. **重试逻辑**
   - 在轮询循环中捕获超时错误
   - 检查是否达到最大重试次数
   - 未达到则等待 `pollInterval` 后重试
   - 达到则抛出原始错误

3. **日志输出**
   - 记录重试次数、等待时间、错误原因

### 3.4 使用示例

```typescript
const client = new JenkinsClient({
  url: 'https://jenkins.example.com',
  username: 'admin',
  apiToken: 'xxx',
});

// 使用重试功能
const result = await client.build('my-job', { param: 'value' }, {
  wait: true,
  pollInterval: 5000,
  maxWaitTime: 600000,
  retryOnTimeout: 5,  // 最多重试 5 次
});
```

## 4. 验收标准

1. ✅ 当 `waitForCompletion` 遇到网络超时时自动重试
2. ✅ 重试次数可通过 `retryOnTimeout` 配置
3. ✅ 重试间隔使用 `pollInterval` 配置值
4. ✅ 达到最大重试次数后抛出原始错误
5. ✅ 正常情况下的行为不受影响
6. ✅ 有清晰的日志记录重试过程

## 5. 设计决策确认

| 决策项 | 确认结果 |
|--------|----------|
| 重试间隔策略 | 固定间隔，使用 `pollInterval` 配置值 |
| 重试范围 | 仅处理超时错误（`ETIMEDOUT`、`ECONNABORTED`） |
| 默认重试次数 | 3 次 |

---

**文档版本**: v1.1
**创建时间**: 2026-07-16
**更新时间**: 2026-07-16
**状态**: 已确认，进入详细设计阶段