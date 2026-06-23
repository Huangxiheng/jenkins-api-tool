import { JenkinsClient, AuthenticationError } from '../src';

/**
 * 验证 Jenkins 连接和认证示例
 * 支持两种方式:
 *   1. API Token 认证 (推荐)
 *   2. 用户名密码认证
 */
async function main() {
  console.log('=== Jenkins Authentication Verification ===\n');

  // 方式1: 使用 API Token 认证 (推荐)
  console.log('[方式1] API Token 认证:');
  const clientWithToken = new JenkinsClient({
    url: process.env.JENKINS_URL || 'http://localhost:8080',
    username: process.env.JENKINS_USERNAME || '',
    apiToken: process.env.JENKINS_API_TOKEN || '',
    logLevel: 'info',
  });

  const result1 = await clientWithToken.verifyAuth();
  console.log(`  服务器: ${result1.url}`);
  console.log(`  认证状态: ${result1.authenticated ? '✓ 成功' : '✗ 失败'}`);
  if (result1.authenticated) {
    console.log(`  当前用户: ${result1.user}`);
    console.log(`  版本信息: ${result1.version || 'N/A'}`);
  }
  console.log('');

  // 方式2: 使用用户名密码认证 (如果配置了密码)
  if (process.env.JENKINS_PASSWORD) {
    console.log('[方式2] 用户名密码认证:');
    const clientWithPassword = new JenkinsClient({
      url: process.env.JENKINS_URL || 'http://localhost:8080',
      username: process.env.JENKINS_USERNAME || '',
      password: process.env.JENKINS_PASSWORD,
      logLevel: 'info',
    });

    const result2 = await clientWithPassword.verifyAuth();
    console.log(`  服务器: ${result2.url}`);
    console.log(`  认证状态: ${result2.authenticated ? '✓ 成功' : '✗ 失败'}`);
    if (result2.authenticated) {
      console.log(`  当前用户: ${result2.user}`);
      console.log(`  版本信息: ${result2.version || 'N/A'}`);
    }
    console.log('');
  } else {
    console.log('[方式2] 未配置 JENKINS_PASSWORD,跳过密码认证测试');
    console.log('');
  }

  console.log('=== Verification Complete ===');
}

main().catch((error: any) => {
  if (error instanceof AuthenticationError) {
    console.error('\n✗ 认证失败:');
    console.error(`  ${error.message}`);
  } else {
    console.error('\n✗ 错误:');
    console.error(`  ${error.message}`);
  }
  process.exit(1);
});
