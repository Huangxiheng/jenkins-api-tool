import { HttpClient } from './http-client';
import { BuildStatusResult, BuildStatus, ArtifactInfo, BuildCause, Parameter } from '../types';
import { Logger } from '../utils/logger';
import { JenkinsError } from '../errors';

interface QueueItem {
  id: number;
  executable?: {
    number: number;
    url: string;
  };
  why?: string;
}

export class StatusService {
  private httpClient: HttpClient;
  private logger: Logger;

  constructor(httpClient: HttpClient) {
    this.httpClient = httpClient;
    this.logger = new Logger();
  }

  /**
   * 查询构建状态
   */
  async getStatus(jobName: string, buildNumber: number | 'last'): Promise<BuildStatusResult> {
    const buildPath = buildNumber === 'last' ? 'lastBuild' : String(buildNumber);
    const url = `/job/${jobName}/${buildPath}/api/json`;

    this.logger.debug(`Fetching build status: ${url}`);

    const data: any = await this.httpClient.get(url);
    return this.parseBuildStatus(data, jobName);
  }

  /**
   * 通过队列 ID 获取构建编号
   */
  async getBuildNumberFromQueue(queueId: number): Promise<{ buildNumber: number; jobName: string } | null> {
    const url = `/queue/item/${queueId}/api/json`;

    this.logger.debug(`Checking queue item: ${url}`);

    const data: QueueItem = await this.httpClient.get(url);

    if (data.executable) {
      const urlParts = data.executable.url.split('/');
      const jobName = urlParts[urlParts.length - 3] || '';
      return {
        buildNumber: data.executable.number,
        jobName,
      };
    }

    return null;
  }

  /**
   * 解析 Jenkins API 响应为 BuildStatusResult
   */
  private parseBuildStatus(data: any, jobName: string): BuildStatusResult {
    const status = this.mapBuildStatus(data.result, data.building);
    const artifacts: ArtifactInfo[] = (data.artifacts || []).map((a: any) => ({
      fileName: a.fileName,
      relativePath: a.relativePath,
    }));

    const actions = data.actions || [];
    const causes: BuildCause[] = [];
    const parameters: Parameter[] = [];

    for (const action of actions) {
      if (action.causes) {
        for (const cause of action.causes) {
          causes.push({
            shortDescription: cause.shortDescription,
            userId: cause.userId,
            userName: cause.userName,
          });
        }
      }

      if (action.parameters) {
        for (const param of action.parameters) {
          parameters.push({
            name: param.name,
            value: param.value,
          });
        }
      }
    }

    return {
      jobName,
      buildNumber: data.number,
      status,
      displayName: data.displayName || `#${data.number}`,
      description: data.description,
      timestamp: data.timestamp || 0,
      duration: data.duration || 0,
      estimatedDuration: data.estimatedDuration,
      building: data.building || false,
      url: data.url || '',
      consoleUrl: `${data.url}consoleText`,
      artifacts,
      causes,
      parameters,
    };
  }

  /**
   * 映射 Jenkins 状态到 BuildStatus
   */
  private mapBuildStatus(result: string | null, building: boolean): BuildStatus {
    if (building) {
      return 'IN_PROGRESS';
    }

    switch (result) {
      case 'SUCCESS':
        return 'SUCCESS';
      case 'FAILURE':
        return 'FAILURE';
      case 'ABORTED':
        return 'ABORTED';
      case 'UNSTABLE':
        return 'UNSTABLE';
      case 'NOT_BUILT':
        return 'NOT_BUILT';
      case null:
      case undefined:
        return 'UNKNOWN';
      default:
        return 'UNKNOWN';
    }
  }
}
