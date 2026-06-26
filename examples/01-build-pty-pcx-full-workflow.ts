/**
 * 完整工作流示例
 * 1. 触发构建（带参数）
 * 2. 等待构建完成
 * 3. 下载工作空间中的文件
 */

import { JenkinsClient, BuildFailedError, TimeoutError, LogLevel, CompressService } from '../src';
import * as fs from 'fs';
import * as path from 'path';

/**
 * 等待文件取消占用
 * @param filePath 文件路径
 * @param maxRetries 最大重试次数
 * @param retryInterval 重试间隔（毫秒）
 */
async function waitForFileUnlock(
  filePath: string,
  maxRetries: number = 10,
  retryInterval: number = 1000
): Promise<void> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      // 尝试以读写模式打开文件，如果成功说明文件未被占用
      fs.accessSync(filePath, fs.constants.R_OK | fs.constants.W_OK);
      return; // 文件可用，直接返回
    } catch (error) {
      if (i < maxRetries - 1) {
        console.log(`  文件被占用，等待 ${(retryInterval / 1000).toFixed(1)} 秒后重试 (${i + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, retryInterval));
      } else {
        throw new Error(`文件持续被占用，已重试 ${maxRetries} 次`);
      }
    }
  }
}

/**
 * 查找可用的 ZIP 文件路径（处理重名情况）
 * @param outputDir 输出目录
 * @param baseFileName 基础文件名（不含扩展名和版本号）
 * @returns 可用的完整文件路径
 */
function findAvailableZipPath(outputDir: string, baseFileName: string): string {
  // 先尝试不带版本号的文件名
  const basePath = path.join(outputDir, `${baseFileName}.zip`);
  if (!fs.existsSync(basePath)) {
    console.log(`  [版本检测] 基础文件不存在，使用: ${path.basename(basePath)}`);
    return basePath;
  }

  console.log(`  [版本检测] 基础文件已存在: ${path.basename(basePath)}`);

  // 查找已有的版本号，取最大值 + 1
  let maxVersion = 0;
  const pattern = new RegExp(`^${baseFileName}_(\\d{3})\\.zip$`);
  console.log(`  [版本检测] 正则模式: ${pattern.source}`);
  
  try {
    const files = fs.readdirSync(outputDir);
    console.log(`  [版本检测] 目录中共 ${files.length} 个文件`);
    for (const file of files) {
      const match = file.match(pattern);
      if (match) {
        const version = parseInt(match[1], 10);
        console.log(`  [版本检测] 匹配到: ${file} -> 版本号 ${version}`);
        if (version > maxVersion) {
          maxVersion = version;
        }
      }
    }
  } catch (error) {
    console.error(`  [版本检测] 读取目录失败: ${error}`);
  }

  console.log(`  [版本检测] 最大版本号: ${maxVersion}`);

  // 使用最大版本号 + 1
  const newVersion = maxVersion + 1;
  const versionStr = String(newVersion).padStart(3, '0');
  const resultPath = path.join(outputDir, `${baseFileName}_${versionStr}.zip`);
  console.log(`  [版本检测] 最终使用: ${path.basename(resultPath)}`);
  return resultPath;
}

async function main() {
  // 1. 初始化客户端
  const client = new JenkinsClient({
    url: process.env.JENKINS_URL || 'http://your-jenkins-server:8080',
    username: process.env.JENKINS_USERNAME || '',
    password: process.env.JENKINS_PASSWORD || '',
    logLevel: (process.env.LOG_LEVEL || 'info') as LogLevel,
  });

  const jobName = 'server/job/pex/job/pty-pcx';
  const downloadDir = 'C:\\BandZip\\lib';
  const outputZipDir = 'C:\\BandZip';


  // ============================================
  // 步骤 1: 触发构建并等待完成
  // ============================================
  console.log('--- 步骤 1: 触发构建并等待完成 ---');
  
  try {
    const buildResult = await client.build(
      jobName,
      {
        git_branch: 'hxh0602_PCX_Feature_20260212_chongqingwenlv',
        version_type: 'RELEASE',
        release_version: '2026M06P01',
        update_module_version: 'false',
        update_dependency_version: 'false',
      },
      {
        wait: true,              // 等待构建完成
        pollInterval: 20000,      // 每 20 秒轮询一次 
        maxWaitTime: 3600000,     // 最大等待 1 小时
        crumbIssuer: true,       // 启用 CSRF 保护
      }
    );

    if ('buildNumber' in buildResult) {
      console.log(`✓ 构建完成: #${buildResult.buildNumber}`);
      console.log(`  状态: ${buildResult.status}`);
      console.log(`  耗时: ${buildResult.duration}ms`);
    } else {
      console.log(`✓ 构建已触发: Queue ID ${buildResult.queueId}`);
      return;
    }


    console.log('--- 步骤 2: 下载工作空间文件 ---');
    let downloadedFilePath = '';
    try {
      const result = await client.download(
        jobName,
        undefined,  // 使用刚完成的构建编号，实测构建产物没有在构建编号的workspace中，需要使用undefined
        'pty-pcx/pcx-4.0.1.1284-ENT-RELEASE.zip',  // workspace 内的相对路径
        downloadDir,
        { source: 'workspace' }
      );
      console.log(`✓ 下载成功: ${result.fileName} (${result.size} 字节)`);
      console.log(`  本地路径: ${result.localPath}`);
      console.log(`  下载耗时: ${result.duration}ms\n`);
      downloadedFilePath = result.localPath;
    } catch (error: any) {
      console.error(`✗ 下载失败: ${error.message}\n`);
    }

    // ============================================
    // 步骤 3: 解压下载的文件
    // ============================================
    if (downloadedFilePath && fs.existsSync(downloadedFilePath)) {
      console.log('--- 步骤 3: 解压下载的文件 ---');
      try {
        const compressService = new CompressService();
        const extractResult = await compressService.extract(
          downloadedFilePath,
          {
            outputDir: downloadDir,  // 解压到 outputDir
            overwrite: true,       // 覆盖已存在的文件
          }
        );
        console.log(`✓ 解压完成: ${extractResult.extractedCount} 个文件`);
        console.log(`  解压目录: ${extractResult.outputDir}`);
        console.log(`  解压耗时: ${extractResult.duration}ms\n`);
      } catch (error: any) {
        console.error(`✗ 解压失败: ${error.message}\n`);
      }

      // ============================================
      // 步骤 4: 等待文件取消占用后删除下载的压缩包
      // ============================================
      console.log('--- 步骤 4: 删除下载的压缩包 ---');
      try {
        // 等待文件取消占用（重试机制）
        await waitForFileUnlock(downloadedFilePath, 10, 1000);
        
        // 删除文件
        fs.unlinkSync(downloadedFilePath);
        console.log(`✓ 已删除压缩包: ${downloadedFilePath}\n`);
      } catch (error: any) {
        console.error(`✗ 删除压缩包失败: ${error.message}\n`);
      }

      // ============================================
      // 步骤 5: 压缩 lib 文件夹
      // ============================================
      console.log('--- 步骤 5: 压缩 lib 文件夹 ---');
      try {
        const compressService = new CompressService();
        
        // 生成带日期的文件名
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const baseFileName = `update_patch_pcx_chongQingWenLv_${dateStr}`;
        
        // 查找可用的文件名（处理重名情况）
        const outputZipPath = findAvailableZipPath(outputZipDir, baseFileName);
        
        const compressResult = await compressService.compress(
          downloadDir,  // 压缩 downloadDir 下的所有文件
          outputZipPath,
          {
            level: 2,         // 正常压缩
            format: 'zip',    // ZIP 格式
            recursive: true,  // 递归子目录
            storeRoot: true,  // 存储根目录
            threads: 0,       // 自动线程数
            overwrite: false, // 不覆盖（因为已经处理了重名）
          }
        );
        console.log(`✓ 压缩完成: ${path.basename(compressResult.archivePath)}`);
        console.log(`  文件大小: ${(compressResult.size / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  压缩耗时: ${compressResult.duration}ms\n`);
      } catch (error: any) {
        console.error(`✗ 压缩失败: ${error.message}\n`);
      }
    }

  } catch (error: any) {
    if (error instanceof BuildFailedError) {
      console.error(`✗ 构建失败: #${error.buildNumber}`);
    } else if (error instanceof TimeoutError) {
      console.error(`✗ 构建超时: ${error.message}`);
    } else {
      console.error(`✗ 错误: ${error.message}`);
    }
  }

  console.log('=== 工作流结束 ===');
}

main().catch(console.error);
