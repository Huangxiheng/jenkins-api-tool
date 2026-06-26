import { JenkinsClient, LogLevel } from "../src";
import path from "path";
import * as fs from "fs";
import axios from "axios";

/**
 * 文件参数构建示例
 * 演示如何在触发构建时上传文件作为参数
 */
async function main() {
  const client = new JenkinsClient({
      url: process.env.JENKINS_URL || 'http://your-jenkins-server:8080',
      username: process.env.JENKINS_USERNAME || '',
      password: process.env.JENKINS_PASSWORD || '',
      logLevel: (process.env.LOG_LEVEL || 'info') as LogLevel,
    });

  // 获取当前工作目录下的配置文件路径
  const configFilePath = path.join(process.cwd(), "examples", "vOrange-wl-hxh");

  // 触发带文件参数的构建
  const result = await client.build(
    "web/job/orange-aliyun",
    {
      // 普通字符串参数
      build_type: "vOrange",
      // 文件参数 - 使用 { type: 'file', path: '文件路径' } 格式
      version_file: { type: "file", path: configFilePath },
      // 可以添加多个文件参数
      // DEPLOY_SCRIPT: { type: 'file', path: './deploy.sh' },
      // ENV_FILE: { type: 'file', path: './.env' },
      options:
        "update_code,npm_build,package,update_package,package_monthly,orange_patch",
    },
    {
      wait: true, // 等待构建完成
      pollInterval: 60000, // 每 60 秒轮询一次
      maxWaitTime: 3600000, // 最大等待 1 小时
      crumbIssuer: true, // 启用 CSRF 保护
    },
  );

  console.log("Build triggered with file parameters:");
  console.log(`  Queue ID: ${result.queueId}`);
  console.log(`  URL: ${result.url}`);

  // 获取控制台日志并提取生成的 zip 包名
  if ("buildNumber" in result) {
    const consoleText = await client.getConsoleText(
      "web/job/orange-aliyun",
      result.buildNumber
    );

    // 匹配 orange_YYYYMMDDHHmmss.zip 格式
    const zipMatch = consoleText.match(/orange_\d{14}\.zip/);
    if (zipMatch) {
      console.log(`  Generated package: ${zipMatch[0]}`);

      // 触发 orange-patch 构建
      console.log("\n=== Triggering orange-patch build ===");
      const patchResult = await client.build(
        "web/job/orange-patch",
        {
          orange_package: zipMatch[0].replace('orange_', 'orange-patch-'),
          orange_module: "pcx",
        },
        {
          wait: true,
          pollInterval: 10000,
          maxWaitTime: 600000,
          crumbIssuer: true,
        }
      );

      // 读取 orange-patch 控制台输出
      if ("buildNumber" in patchResult) {
        console.log(`  orange-patch build #${patchResult.buildNumber} completed`);

        const patchConsoleText = await client.getConsoleText(
          "web/job/orange-patch",
          patchResult.buildNumber
        );

        // 匹配外网下载链接
        const downloadUrlMatch = patchConsoleText.match(
          /http:\/\/223\.223\.178\.68:2004\/jenkins-orange-patch\/[^\s"'<>]+\.zip/
        );

        if (downloadUrlMatch) {
          const downloadUrl = downloadUrlMatch[0];
          console.log(`  Found download URL: ${downloadUrl}`);

          // 下载文件到 downloads 目录
          const outputDir = path.join(process.cwd(), "downloads");
          const fileName = path.basename(downloadUrl);
          const outputPath = path.join(outputDir, fileName);

          if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
          }

          console.log(`  Downloading to: ${outputPath}`);
          const response = await axios.get(downloadUrl, {
            responseType: "stream",
          });

          const writer = fs.createWriteStream(outputPath);
          response.data.pipe(writer);

          await new Promise<void>((resolve, reject) => {
            writer.on("finish", () => resolve());
            writer.on("error", reject);
          });

          console.log(`  Downloaded: ${outputPath}`);
        } else {
          console.log("  Warning: No download URL found in orange-patch console output");
        }
      }
    } else {
      console.log("  Warning: No orange_*.zip package found in console log");
    }
  }

  
}

main().catch(console.error);
