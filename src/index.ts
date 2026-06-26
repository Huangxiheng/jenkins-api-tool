/**
 * Jenkins API Tool - Node.js SDK for Jenkins RESTful API
 */

// Core client
export { JenkinsClient } from './client/jenkins-client';

// Types
export type {
  LogLevel,
  JenkinsClientConfig,
  FileParameter,
  BuildParameters,
  BuildOptions,
  BuildStatus,
  ArtifactInfo,
  BuildTriggerResult,
  BuildCompleteResult,
  BuildCause,
  Parameter,
  BuildStatusResult,
  DownloadResult,
  DownloadAllResult,
} from './types';

// Errors
export {
  JenkinsError,
  AuthenticationError,
  JobNotFoundError,
  BuildFailedError,
  TimeoutError,
  ArtifactNotFoundError,
  NetworkError,
} from './errors';

// Config
export { loadConfig } from './config';

// Compress service
export { CompressService } from './services/bandzip-service';
export type { ExtractResult, ExtractOptions, CompressResult, CompressOptions } from './services/bandzip-service';
