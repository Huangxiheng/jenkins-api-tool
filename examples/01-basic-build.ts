import { JenkinsClient } from '../src';

/**
 * 基础构建示例 - 无参数触发构建
 */
async function main() {
  // 初始化客户端
  const client = new JenkinsClient({
    url: process.env.JENKINS_URL || 'http://localhost:8080',
    username: process.env.JENKINS_USERNAME || '',
    apiToken: process.env.JENKINS_API_TOKEN || '',
  });

  // 触发构建 (异步,不等待完成)
  const result = await client.build('your-job-name');

  console.log('Build triggered:');
  console.log(`  Queue ID: ${result.queueId}`);
  console.log(`  URL: ${result.url}`);
}

main().catch(console.error);
