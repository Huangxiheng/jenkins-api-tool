import axios, { AxiosInstance, AxiosResponse, AxiosError } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { JenkinsClientConfig } from '../types';
import { Logger } from '../utils/logger';
import { AuthenticationError, NetworkError, JenkinsError, JobNotFoundError, ArtifactNotFoundError } from '../errors';

interface CrumbData {
  crumbRequestField: string;
  crumb: string;
}

export class HttpClient {
  private axiosInstance: AxiosInstance;
  private config: JenkinsClientConfig;
  private logger: Logger;
  private crumb: string | null = null;

  constructor(config: JenkinsClientConfig) {
    this.config = config;
    this.logger = new Logger(config.logLevel || 'info');

    const credential = this.getCredential(config);

    this.axiosInstance = axios.create({
      baseURL: config.url,
      timeout: config.timeout || 30000,
      auth: {
        username: config.username,
        password: credential,
      },
      headers: {
        'Content-Type': 'application/json',
      },
    });

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => this.handleAxiosError(error)
    );
  }

  /**
   * 获取认证凭据 (优先使用 apiToken,其次使用 password)
   */
  private getCredential(config: JenkinsClientConfig): string {
    if (config.apiToken) {
      return config.apiToken;
    }
    if (config.password) {
      return config.password;
    }
    throw new Error('Either "apiToken" or "password" must be provided in JenkinsClientConfig');
  }

  getBaseUrl(): string {
    return this.config.url;
  }

  /**
   * 初始化 CSRF crumb (如果启用)
   */
  async initCrumb(): Promise<void> {
    try {
      const response = await this.axiosInstance.get('/crumbIssuer/api/json');
      const data = response.data as CrumbData;
      this.crumb = data.crumb;
      this.axiosInstance.defaults.headers[data.crumbRequestField] = this.crumb;
      this.logger.debug('CSRF crumb obtained');
    } catch (error: any) {
      if (error.response?.status === 404) {
        this.logger.debug('CSRF protection not enabled on Jenkins server');
      } else {
        this.logger.warn('Failed to obtain CSRF crumb:', error.message);
      }
    }
  }

  /**
   * GET 请求
   */
  async get<T>(urlPath: string, params?: Record<string, any>): Promise<T> {
    const response: AxiosResponse<T> = await this.axiosInstance.get(urlPath, { params });
    return response.data;
  }

  /**
   * POST 请求
   */
  async post<T>(urlPath: string, data?: any, headers?: Record<string, string>): Promise<{ data: T; headers: Record<string, string> }> {
    const response: AxiosResponse<T> = await this.axiosInstance.post(urlPath, data, { headers });
    return { data: response.data, headers: response.headers as Record<string, string> };
  }

  /**
   * 下载文件 (流式)
   */
  async download(
    urlPath: string,
    outputPath: string,
    onProgress?: (progress: number, downloaded: number, total: number) => void
  ): Promise<void> {
    const response = await this.axiosInstance.get(urlPath, {
      responseType: 'stream',
    });

    const totalBytes = parseInt(String(response.headers['content-length'] || '0'), 10);
    let downloadedBytes = 0;

    return new Promise((resolve, reject) => {
      const dir = path.dirname(outputPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      const writer = fs.createWriteStream(outputPath);

      response.data.on('data', (chunk: Buffer) => {
        downloadedBytes += chunk.length;
        if (onProgress && totalBytes > 0) {
          onProgress(downloadedBytes / totalBytes, downloadedBytes, totalBytes);
        }
      });

      response.data.pipe(writer);

      writer.on('finish', () => resolve());
      writer.on('error', (err) => reject(err));
    });
  }

  /**
   * 处理 Axios 错误
   */
  private handleAxiosError(error: AxiosError): never {
    if (error.response) {
      const { status, data } = error.response;

      if (status === 401 || status === 403) {
        throw new AuthenticationError(
          `Authentication failed (${status}). Please check your username and API token.`,
          status
        );
      }

      if (status === 404) {
        const message = typeof data === 'string' ? data : 'Resource not found';
        if (message.includes('job') || message.includes('Job')) {
          throw new JobNotFoundError(message);
        }
        throw new JenkinsError(message, status);
      }

      throw new JenkinsError(
        `Request failed with status ${status}: ${error.message}`,
        status
      );
    }

    if (error.code === 'ECONNABORTED') {
      throw new NetworkError(`Request timed out after ${this.config.timeout || 30000}ms`);
    }

    throw new NetworkError(`Network error: ${error.message}`);
  }
}
