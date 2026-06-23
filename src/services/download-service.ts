import * as path from 'path';
import * as fs from 'fs';
import { HttpClient } from './http-client';
import { StatusService } from './status-service';
import { DownloadResult, DownloadAllResult } from '../types';
import { Logger } from '../utils/logger';
import { formatFileSize } from '../utils/helpers';
import { ArtifactNotFoundError, JenkinsError } from '../errors';

export class DownloadService {
  private httpClient: HttpClient;
  private statusService: StatusService;
  private logger: Logger;

  constructor(httpClient: HttpClient, statusService: StatusService) {
    this.httpClient = httpClient;
    this.statusService = statusService;
    this.logger = new Logger();
  }

  /**
   * 下载单个产物
   */
  async downloadArtifact(
    jobName: string,
    buildNumber: number,
    artifactPath: string,
    outputDir: string
  ): Promise<DownloadResult> {
    this.logger.info(`Downloading artifact: ${artifactPath}`);

    const url = `/job/${jobName}/${buildNumber}/artifact/${artifactPath}`;
    const fileName = path.basename(artifactPath);
    const outputPath = path.join(outputDir, fileName);

    this.ensureDir(outputDir);

    const startTime = Date.now();

    await this.httpClient.download(
      url,
      outputPath,
      (progress, downloaded, total) => {
        if (progress > 0) {
          this.logger.debug(
            `Download progress: ${formatFileSize(downloaded)} / ${formatFileSize(total)} (${(progress * 100).toFixed(1)}%)`
          );
        }
      }
    );

    const duration = Date.now() - startTime;
    const size = fs.statSync(outputPath).size;

    this.logger.info(`Downloaded: ${fileName} (${formatFileSize(size)}, ${duration}ms)`);

    return {
      fileName,
      localPath: outputPath,
      size,
      duration,
    };
  }

  /**
   * 下载所有产物
   */
  async downloadAllArtifacts(
    jobName: string,
    buildNumber: number,
    outputDir: string
  ): Promise<DownloadAllResult> {
    this.logger.info(`Fetching artifact list for ${jobName} #${buildNumber}`);

    const status = await this.statusService.getStatus(jobName, buildNumber);

    if (status.artifacts.length === 0) {
      this.logger.warn('No artifacts found for this build');
      return {
        total: 0,
        success: 0,
        failed: 0,
        results: [],
      };
    }

    this.logger.info(`Found ${status.artifacts.length} artifact(s)`);
    this.ensureDir(outputDir);

    const results: DownloadResult[] = [];
    let success = 0;
    let failed = 0;

    for (const artifact of status.artifacts) {
      try {
        const result = await this.downloadArtifact(jobName, buildNumber, artifact.relativePath, outputDir);
        results.push(result);
        success++;
      } catch (error: any) {
        this.logger.error(`Failed to download ${artifact.fileName}: ${error.message}`);
        failed++;
      }
    }

    this.logger.info(`Download complete: ${success} succeeded, ${failed} failed`);

    return {
      total: status.artifacts.length,
      success,
      failed,
      results,
    };
  }

  /**
   * 确保目录存在
   */
  private ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }
}
