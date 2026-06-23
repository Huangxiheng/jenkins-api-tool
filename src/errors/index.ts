/**
 * 基础 Jenkins 错误类
 */
export class JenkinsError extends Error {
  override name = 'JenkinsError';
  statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * 认证错误 (401/403)
 */
export class AuthenticationError extends JenkinsError {
  override name = 'AuthenticationError';

  constructor(message = 'Authentication failed. Please check your username and API token.', statusCode = 401) {
    super(message, statusCode);
  }
}

/**
 * Job 不存在错误 (404)
 */
export class JobNotFoundError extends JenkinsError {
  override name = 'JobNotFoundError';

  constructor(jobName: string) {
    super(`Job not found: ${jobName}`, 404);
  }
}

/**
 * 构建失败错误
 */
export class BuildFailedError extends JenkinsError {
  override name = 'BuildFailedError';
  buildNumber: number;

  constructor(message: string, buildNumber: number) {
    super(message);
    this.buildNumber = buildNumber;
  }
}

/**
 * 超时错误
 */
export class TimeoutError extends JenkinsError {
  override name = 'TimeoutError';

  constructor(message = 'Operation timed out') {
    super(message);
  }
}

/**
 * 产物不存在错误
 */
export class ArtifactNotFoundError extends JenkinsError {
  override name = 'ArtifactNotFoundError';

  constructor(artifactPath: string) {
    super(`Artifact not found: ${artifactPath}`);
  }
}

/**
 * 网络错误
 */
export class NetworkError extends JenkinsError {
  override name = 'NetworkError';

  constructor(message: string) {
    super(message);
  }
}
