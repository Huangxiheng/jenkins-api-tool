import { JenkinsClient, BuildFailedError, TimeoutError } from '../src';

/**
 * 等待构建完成示例 (同步模式)
 */
async function main() {
  const client = new JenkinsClient({
    url: process.env.JENKINS_URL || 'http://localhost:8080',
    username: process.env.JENKINS_USERNAME || '',
    apiToken: process.env.JENKINS_API_TOKEN || '',
    logLevel: 'info',
  });

  try {
    // 触发构建并等待完成
    const result = await client.build('your-job-name', {
      ENV: 'staging',
    }, {
      wait: true,              // 等待构建完成
      pollInterval: 5000,      // 每 5 秒轮询一次
      maxWaitTime: 300000,     // 最大等待 5 分钟
    });

    console.log('Build completed successfully!');
    console.log(`  Build #: ${result.buildNumber}`);
    console.log(`  Status: ${result.status}`);
    console.log(`  Duration: ${result.duration}ms`);
    console.log(`  Artifacts: ${result.artifacts.length} file(s)`);

    for (const artifact of result.artifacts) {
      console.log(`    - ${artifact.fileName} (${artifact.relativePath})`);
    }
  } catch (error: any) {
    if (error instanceof BuildFailedError) {
      console.error(`Build failed: #${error.buildNumber}`);
    } else if (error instanceof TimeoutError) {
      console.error(`Build timed out: ${error.message}`);
    } else {
      console.error('Error:', error.message);
    }
  }
}

main().catch(console.error);
