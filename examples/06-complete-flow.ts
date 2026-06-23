import { JenkinsClient, BuildFailedError, TimeoutError } from '../src';

/**
 * 完整流程示例: 触发构建 → 等待完成 → 查询状态 → 下载产物
 */
async function main() {
  // 1. 初始化客户端
  const client = new JenkinsClient({
    url: process.env.JENKINS_URL || 'http://localhost:8080',
    username: process.env.JENKINS_USERNAME || '',
    apiToken: process.env.JENKINS_API_TOKEN || '',
    logLevel: 'info',
  });

  const jobName = 'your-job-name';
  const outputDir = './builds';

  try {
    // 2. 触发构建并等待完成
    console.log('=== Step 1: Trigger Build ===');
    const buildResult = await client.build(jobName, {
      ENV: 'production',
      VERSION: '1.0.0',
    }, {
      wait: true,
      pollInterval: 5000,
      maxWaitTime: 600000,
    });

    console.log(`Build #${buildResult.buildNumber} completed with status: ${buildResult.status}`);
    console.log(`Artifacts: ${buildResult.artifacts.length} file(s)\n`);

    // 3. 查询构建状态
    console.log('=== Step 2: Check Build Status ===');
    const status = await client.getStatus(jobName, buildResult.buildNumber);

    console.log(`Status: ${status.status}`);
    console.log(`Duration: ${status.duration}ms`);
    console.log(`URL: ${status.url}`);

    if (status.parameters.length > 0) {
      console.log('Parameters:');
      for (const param of status.parameters) {
        console.log(`  ${param.name} = ${param.value}`);
      }
    }
    console.log('');

    // 4. 下载产物
    if (status.artifacts.length > 0) {
      console.log('=== Step 3: Download Artifacts ===');
      const downloadResult = await client.downloadAll(jobName, buildResult.buildNumber, outputDir);

      console.log(`Downloaded: ${downloadResult.success}/${downloadResult.total} files`);

      if (downloadResult.failed > 0) {
        console.warn(`Warning: ${downloadResult.failed} file(s) failed to download`);
      }
    }

    // 5. 获取构建日志
    console.log('\n=== Step 4: Fetch Console Log ===');
    const consoleText = await client.getConsoleText(jobName, buildResult.buildNumber);
    const lastLines = consoleText.split('\n').slice(-5).join('\n');
    console.log('Last 5 lines of console output:');
    console.log(lastLines);

    console.log('\n=== Complete! ===');

  } catch (error: any) {
    if (error instanceof BuildFailedError) {
      console.error(`Build failed: #${error.buildNumber}`);
      console.error(`Error: ${error.message}`);
    } else if (error instanceof TimeoutError) {
      console.error(`Operation timed out: ${error.message}`);
    } else {
      console.error('Error:', error.message);
    }
  }
}

main().catch(console.error);
