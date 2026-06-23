import * as fs from 'fs';
import FormData from 'form-data';
import { HttpClient } from './http-client';
import { StatusService } from './status-service';
import {
  BuildParameters,
  BuildOptions,
  BuildTriggerResult,
  BuildCompleteResult,
  BuildStatus,
  FileParameter,
} from '../types';
import { Logger } from '../utils/logger';
import { formatDuration } from '../utils/helpers';
import { TimeoutError, BuildFailedError, JenkinsError } from '../errors';

export class BuildService {
  private httpClient: HttpClient;
  private statusService: StatusService;
  private logger: Logger;

  constructor(httpClient: HttpClient, statusService: StatusService) {
    this.httpClient = httpClient;
    this.statusService = statusService;
    this.logger = new Logger();
  }

  /**
   * 触发构建
   */
  async trigger(
    jobName: string,
    params?: BuildParameters,
    options?: BuildOptions
  ): Promise<BuildTriggerResult> {
    const hasParams = params && Object.keys(params).length > 0;
    const useCrumb = options?.crumbIssuer !== false;

    if (useCrumb) {
      await this.httpClient.initCrumb();
    }

    let queueId: number;

    if (hasParams) {
      queueId = await this.triggerWithParameters(jobName, params!);
    } else {
      queueId = await this.triggerWithoutParameters(jobName);
    }

    const url = `${this.httpClient.getBaseUrl()}/job/${jobName}/`;

    this.logger.info(`Build triggered: ${jobName} (Queue ID: ${queueId})`);

    return {
      queueId,
      url,
      jobName,
    };
  }

  /**
   * 等待构建完成 (轮询)
   */
  async waitForCompletion(
    jobName: string,
    queueId: number,
    options: { pollInterval: number; maxWaitTime: number }
  ): Promise<BuildCompleteResult> {
    const startTime = Date.now();
    const { pollInterval, maxWaitTime } = options;

    this.logger.info(`Waiting for build to complete (poll interval: ${pollInterval}ms, max wait: ${formatDuration(maxWaitTime)})`);

    // Step 1: Poll queue until executable is available
    let buildNumber: number | null = null;
    while (!buildNumber) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new TimeoutError(`Timed out waiting for build to start (max wait: ${formatDuration(maxWaitTime)})`);
      }

      this.logger.debug(`Checking queue item ${queueId}...`);
      const queueInfo = await this.statusService.getBuildNumberFromQueue(queueId);

      if (queueInfo && queueInfo.buildNumber) {
        buildNumber = queueInfo.buildNumber;
        this.logger.info(`Build started: #${buildNumber}`);
      } else {
        await this.sleep(pollInterval);
      }
    }

    // Step 2: Poll build status until completion
    while (true) {
      if (Date.now() - startTime > maxWaitTime) {
        throw new TimeoutError(`Build timed out after ${formatDuration(maxWaitTime)}`);
      }

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
    }
  }

  /**
   * 触发无参构建
   */
  private async triggerWithoutParameters(jobName: string): Promise<number> {
    const url = `/job/${jobName}/build`;

    try {
      const response = await this.httpClient.post(url, null, {
        'Content-Type': 'application/x-www-form-urlencoded',
      });
      return this.extractQueueId(response);
    } catch (error: any) {
      this.handleBuildTriggerError(error, jobName);
    }
  }

  /**
   * 触发带参构建
   */
  private async triggerWithParameters(
    jobName: string,
    params: BuildParameters
  ): Promise<number> {
    const url = `/job/${jobName}/buildWithParameters`;
    const hasFileParams = Object.values(params).some(
      (v) => typeof v === 'object' && v !== null && (v as FileParameter).type === 'file'
    );

    try {
      if (hasFileParams) {
        // Use FormData for file parameters
        const formData = await this.prepareFormData(params);
        const response = await this.httpClient.post(url, formData, {
          ...formData.getHeaders(),
        });
        return this.extractQueueId(response);
      } else {
        // Use query string for simple parameters
        const queryParams = this.prepareQueryParams(params);
        const queryString = new URLSearchParams(queryParams as any).toString();
        const fullUrl = `${url}?${queryString}`;

        const response = await this.httpClient.post(fullUrl, null, {
          'Content-Length': '0',
        });
        return this.extractQueueId(response);
      }
    } catch (error: any) {
      this.handleBuildTriggerError(error, jobName);
    }
  }

  /**
   * 准备 FormData (包含文件)
   */
  private async prepareFormData(params: BuildParameters): Promise<FormData> {
    const formData = new FormData();

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'object' && value !== null && (value as FileParameter).type === 'file') {
        const fileParam = value as FileParameter;
        const fileStream = fs.createReadStream(fileParam.path);
        formData.append(key, fileStream);
      } else if (typeof value === 'boolean') {
        formData.append(key, value ? 'true' : 'false');
      } else {
        formData.append(key, String(value));
      }
    }

    return formData;
  }

  /**
   * 准备查询参数
   */
  private prepareQueryParams(params: BuildParameters): Record<string, string> {
    const result: Record<string, string> = {};

    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'boolean') {
        result[key] = value ? 'true' : 'false';
      } else if (typeof value === 'string') {
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * 从响应中提取 Queue ID
   */
  private extractQueueId(response: { data: any; headers: Record<string, string> }): number {
    // Jenkins returns queue ID in the Location header or response body
    const location = response.headers['location'];
    if (location) {
      const match = location.match(/\/queue\/item\/(\d+)/);
      if (match) {
        return parseInt(match[1], 10);
      }
    }

    // Fallback: check response body
    if (typeof response.data === 'object' && response.data !== null) {
      if (response.data.queueId) {
        return response.data.queueId;
      }
    }

    this.logger.warn('Queue ID not found in response');
    return 0;
  }

  /**
   * 处理构建触发错误
   */
  private handleBuildTriggerError(error: any, jobName: string): never {
    if (error.message && error.message.includes('404')) {
      throw new JenkinsError(`Job not found: ${jobName}`, 404);
    }
    throw error;
  }

  /**
   * 延迟函数
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
