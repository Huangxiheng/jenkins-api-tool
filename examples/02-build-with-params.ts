import { JenkinsClient } from '../src';

/**
 * 带参数构建示例
 */
async function main() {
  const client = new JenkinsClient({
    url: process.env.JENKINS_URL || 'http://localhost:8080',
    username: process.env.JENKINS_USERNAME || '',
    apiToken: process.env.JENKINS_API_TOKEN || '',
  });

  // 触发带参数构建
  const result = await client.build('your-job-name', {
    ENV: 'production',
    VERSION: '1.0.0',
    ENABLE_CACHE: true,
    // 文件参数示例:
    // CONFIG_FILE: { type: 'file', path: './config.json' },
  });

  console.log('Build triggered with parameters:');
  console.log(`  Queue ID: ${result.queueId}`);
  console.log(`  URL: ${result.url}`);
}

main().catch(console.error);
