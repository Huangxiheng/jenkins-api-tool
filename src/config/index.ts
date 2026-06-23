import dotenv from 'dotenv';
import { JenkinsClientConfig, LogLevel } from '../types';
import { stripTrailingSlash } from '../utils/helpers';

dotenv.config();

/**
 * 从环境变量加载配置
 */
export function loadConfig(): Partial<JenkinsClientConfig> {
  const config: Partial<JenkinsClientConfig> = {};

  if (process.env.JENKINS_URL) {
    config.url = stripTrailingSlash(process.env.JENKINS_URL);
  }

  if (process.env.JENKINS_USERNAME) {
    config.username = process.env.JENKINS_USERNAME;
  }

  if (process.env.JENKINS_API_TOKEN) {
    config.apiToken = process.env.JENKINS_API_TOKEN;
  }

  if (process.env.JENKINS_PASSWORD) {
    config.password = process.env.JENKINS_PASSWORD;
  }

  if (process.env.JENKINS_TIMEOUT) {
    config.timeout = parseInt(process.env.JENKINS_TIMEOUT, 10);
  }

  if (process.env.LOG_LEVEL) {
    config.logLevel = process.env.LOG_LEVEL as LogLevel;
  }

  return config;
}
