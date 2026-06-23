import { JenkinsClient } from '../src';

/**
 * 下载构建产物示例
 */
async function main() {
  const client = new JenkinsClient({
    url: process.env.JENKINS_URL || 'http://localhost:8080',
    username: process.env.JENKINS_USERNAME || '',
    apiToken: process.env.JENKINS_API_TOKEN || '',
  });

  const jobName = 'your-job-name';
  const buildNumber = 123;
  const outputDir = './downloads';

  // 下载单个产物
  const result = await client.download(jobName, buildNumber, 'target/app.jar', outputDir);
  console.log(`Downloaded: ${result.fileName} -> ${result.localPath}`);
  console.log(`  Size: ${result.size} bytes`);
  console.log(`  Duration: ${result.duration}ms`);

  // 下载所有产物
  const allResult = await client.downloadAll(jobName, buildNumber, outputDir);
  console.log('\nDownload All Results:');
  console.log(`  Total: ${allResult.total}`);
  console.log(`  Success: ${allResult.success}`);
  console.log(`  Failed: ${allResult.failed}`);

  for (const r of allResult.results) {
    console.log(`  - ${r.fileName}: ${r.localPath}`);
  }
}

main().catch(console.error);
