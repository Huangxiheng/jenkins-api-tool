import { JenkinsClient } from '../src';

/**
 * 查询构建状态示例
 */
async function main() {
  const client = new JenkinsClient({
    url: process.env.JENKINS_URL || 'http://localhost:8080',
    username: process.env.JENKINS_USERNAME || '',
    apiToken: process.env.JENKINS_API_TOKEN || '',
  });

  // 查询指定构建状态
  const status = await client.getStatus('your-job-name', 123);

  // 或者查询最后一次构建
  // const status = await client.getStatus('your-job-name', 'last');

  console.log('Build Status:');
  console.log(`  Job: ${status.jobName}`);
  console.log(`  Build #: ${status.displayName}`);
  console.log(`  Status: ${status.status}`);
  console.log(`  Building: ${status.building}`);
  console.log(`  Duration: ${status.duration}ms`);
  console.log(`  URL: ${status.url}`);

  if (status.causes.length > 0) {
    console.log('  Triggered by:');
    for (const cause of status.causes) {
      console.log(`    - ${cause.shortDescription}`);
    }
  }

  if (status.parameters.length > 0) {
    console.log('  Parameters:');
    for (const param of status.parameters) {
      console.log(`    - ${param.name}=${param.value}`);
    }
  }

  if (status.artifacts.length > 0) {
    console.log(`  Artifacts: ${status.artifacts.length} file(s)`);
    for (const artifact of status.artifacts) {
      console.log(`    - ${artifact.fileName}`);
    }
  }
}

main().catch(console.error);
