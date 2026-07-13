/**
 * ============================================================
 * 示例：使用 Git Bash 执行构建、压缩、解压命令
 * ============================================================
 * 
 * 这个示例文件演示了如何在 TypeScript 中调用 Git Bash 来执行命令。
 * 适合初学者学习，代码中有详细的注释说明。
 * 
 * 运行方式：
 *   npx ts-node examples/build-with-bzip.ts
 * ============================================================
 */

// === 1. 导入必要的模块 ===
// child_process 是 Node.js 内置模块，用于执行外部命令
// ExecOptions 是 exec 函数的选项类型
import { exec, ExecOptions } from 'child_process';
// util 模块提供了一些实用工具，这里用来把回调函数转为 Promise
import { promisify } from 'util';
// path 模块用于处理文件路径
import path from 'path';
// fs 模块用于文件系统操作
import fs from 'fs';
// 压缩服务
import { CompressService } from '../src/services/bandzip-service';

// === 2. 将 exec 函数转换为 Promise 版本 ===
// 原始的 exec 使用回调函数，转换为 Promise 后可以使用 async/await，代码更简洁
// 使用类型断言来解决 promisify 的类型推断问题
const execAsync = promisify(exec) as (command: string, options?: ExecOptions) => Promise<{ stdout: string; stderr: string }>;

// === 3. 配置常量 ===
// Git Bash 的可执行文件路径（Windows 系统）
const GIT_BASH_PATH = 'C:\\Program Files\\Git\\bin\\bash.exe';

// uniapp 项目的路径（注意：Git Bash 中使用 /c/ 代替 C:\）
const UNIAPP_PROJECT_PATH = '/c/IDEA/project/uniapp/gwwy-uniapp';

// 目标分支名称
const TARGET_BRANCH = 'Feature_20260130_chongQingWenLvWei';

// 中间切换分支（用于重置跟踪关系）
const DEV_TEST_BRANCH = 'dev_test';

// === 3. 配置路径常量 ===
// Windows 格式路径（用于 Node.js fs 操作）
const UNIAPP_PROJECT_PATH_WIN = 'C:\\IDEA\\project\\uniapp\\gwwy-uniapp';
const DIST_PATH = path.join(UNIAPP_PROJECT_PATH_WIN, 'dist');
const BUILD_PATH = path.join(UNIAPP_PROJECT_PATH_WIN, 'dist', 'build');
const H5_PATH = path.join(BUILD_PATH, 'h5');
const RENAMED_PATH = path.join(BUILD_PATH, 'gwwy-uniapp');
const SOURCE_PATH = path.join(BUILD_PATH, 'gwwy-uniapp');
const OUTPUT_ZIP = path.join(BUILD_PATH, 'gwwy-uniapp.zip');


/**
 * ============================================================
 * 函数：执行 Git Bash 命令
 * ============================================================
 * 这是一个核心函数，所有命令的执行都会用到它。
 * 
 * @param command - 要执行的命令字符串，例如 "ls -la"
 * @param cwd - 可选，命令执行的工作目录
 * @returns 命令的标准输出结果
 */
async function runGitBashCommand(command: string, cwd?: string): Promise<string> {
  // 构造 bash -c 命令格式
  // -c 参数告诉 bash 执行后面的命令字符串
  const bashCommand = `-c "${command}"`;
  
  // 打印正在执行的命令，方便调试
  console.log(`\n[执行命令] ${command}`);
  
  try {
    // 执行命令
    // shell: true 表示通过 shell 执行，这样可以支持管道、重定向等特性
    const { stdout, stderr } = await execAsync(`"${GIT_BASH_PATH}" ${bashCommand}`, {
      cwd: cwd || process.cwd(),  // 如果没指定目录，使用当前工作目录
      shell: 'bash'                         // 使用 bash 执行命令
    });
    
    // 如果有错误输出，打印出来（警告级别）
    if (stderr) {
      console.warn(`[警告] ${stderr}`);
    }
    
    // 返回命令的标准输出
    return stdout;
  } catch (error) {
    // 如果命令执行失败，抛出错误
    console.error(`[错误] 命令执行失败: ${command}`);
    throw error;
  }
}


/**
 * ============================================================
 * 函数：获取当前分支的跟踪分支
 * ============================================================
 * 获取当前分支的 upstream（跟踪分支）信息
 *
 * @returns 跟踪分支名称（如 origin/feature-branch），如果没有则返回空字符串
 */
async function getUpstreamBranch(): Promise<string> {
  try {
    // 使用 git rev-parse 获取当前分支的跟踪分支
    const upstream = (await runGitBashCommand(
      `cd ${UNIAPP_PROJECT_PATH} && git rev-parse --abbrev-ref --symbolic-full-name @{u}`
    )).trim();

    return upstream || '';
  } catch (error) {
    // 如果没有设置跟踪分支，返回空字符串
    return '';
  }
}

/**
 * ============================================================
 * 函数：检查并切换到目标分支
 * ============================================================
 * 这个函数会检查当前分支是否为目标分支，并验证跟踪分支是否正确。
 * 如果不满足条件，会通过中间分支删除目标分支，然后从远程重新拉取并建立跟踪关系。
 * 切换失败会终止整个流程。
 */
async function checkAndSwitchBranch(): Promise<void> {
  console.log('='.repeat(50));
  console.log('检查 Git 分支...');

  // 获取当前分支名称
  const currentBranch = (await runGitBashCommand(`cd ${UNIAPP_PROJECT_PATH} && git branch --show-current`)).trim();

  console.log(`[当前分支] ${currentBranch}`);
  console.log(`[目标分支] ${TARGET_BRANCH}`);

  // 期望的跟踪分支
  const expectedUpstream = `origin/${TARGET_BRANCH}`;

  // 判断是否需要重建分支
  let needRebuild = false;

  // 检查是否已经是目标分支
  if (currentBranch === TARGET_BRANCH) {
    console.log('[提示] 已经在目标分支上');

    // 获取当前分支的跟踪分支
    const upstream = await getUpstreamBranch();
    console.log(`[当前跟踪分支] ${upstream || '未设置'}`);
    console.log(`[期望跟踪分支] ${expectedUpstream}`);

    // 检查跟踪分支是否正确
    if (upstream === expectedUpstream) {
      console.log('[提示] 分支状态正确，无需重建');
      console.log('='.repeat(50));
      return;
    } else {
      console.log('[提示] 跟踪分支不正确，需要重建分支');
      needRebuild = true;
    }
  } else {
    console.log(`[提示] 当前不在目标分支上，需要重建分支`);
    needRebuild = true;
  }

  // 如果需要重建分支
  if (needRebuild) {
    try {
      console.log('\n[开始重建分支流程]');

      // 步骤1：切换到中间分支
      console.log(`\n[步骤1] 切换到中间分支 ${DEV_TEST_BRANCH}...`);
      await runGitBashCommand(`cd ${UNIAPP_PROJECT_PATH} && git checkout ${DEV_TEST_BRANCH}`);
      console.log(`[成功] 已切换到 ${DEV_TEST_BRANCH} 分支`);

      // 步骤2：删除本地目标分支（如果存在）
      console.log(`\n[步骤2] 删除本地 ${TARGET_BRANCH} 分支...`);
      try {
        await runGitBashCommand(`cd ${UNIAPP_PROJECT_PATH} && git branch -D ${TARGET_BRANCH}`);
        console.log(`[成功] 已删除本地 ${TARGET_BRANCH} 分支`);
      } catch (error) {
        // 如果分支不存在，忽略错误
        console.log(`[提示] 本地 ${TARGET_BRANCH} 分支不存在，跳过删除`);
      }

      // 步骤3：从远程同名的目标分支新建本地目标分支
      console.log(`\n[步骤3] 从远程仓库 origin/${TARGET_BRANCH} 新建本地 ${TARGET_BRANCH} 分支...`);
      await runGitBashCommand(`cd ${UNIAPP_PROJECT_PATH} && git checkout -b ${TARGET_BRANCH} origin/${TARGET_BRANCH}`);
      console.log(`[成功] 已创建本地 ${TARGET_BRANCH} 分支并跟踪 origin/${TARGET_BRANCH}`);

      // 步骤4：验证跟踪关系
      console.log(`\n[步骤4] 验证跟踪关系...`);
      const newUpstream = await getUpstreamBranch();
      console.log(`[当前跟踪分支] ${newUpstream || '未设置'}`);
      console.log(`[期望跟踪分支] ${expectedUpstream}`);

      if (newUpstream === expectedUpstream) {
        console.log('[成功] 分支重建完成，跟踪关系正确');
      } else {
        throw new Error(`分支重建失败，跟踪关系不正确: ${newUpstream}`);
      }

    } catch (error) {
      console.error(`\n[错误] 分支重建失败！`);
      console.error('整个流程已终止');
      throw new Error(`无法正确重建分支: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  console.log('='.repeat(50));
}


/**
 * ============================================================
 * 函数：拉取最新代码
 * ============================================================
 * 这个函数会从远程仓库拉取最新代码。
 */
async function pullLatestCode(): Promise<void> {
  console.log('='.repeat(50));
  console.log('拉取最新代码...');
  
  // 执行 git pull 拉取最新代码
  await runGitBashCommand(`cd ${UNIAPP_PROJECT_PATH} && git pull`);
  
  console.log('代码拉取完成！');
  console.log('='.repeat(50));
}


/**
 * ============================================================
 * 函数：执行 npm build 构建
 * ============================================================
 * 这个函数会切换到 uniapp 项目目录并执行 npm run build
 */
async function runBuild(): Promise<void> {
  // 打印提示信息
  console.log('='.repeat(50));
  console.log('开始构建 uniapp 项目...');
  
  // 执行构建命令
  // cd 切换到项目目录 && 执行 npm run build
  // && 表示前一个命令成功后才执行下一个命令
  await runGitBashCommand(`cd ${UNIAPP_PROJECT_PATH} && npm run build`);
  
  console.log('构建完成！');
  console.log('='.repeat(50));
}


/**
 * ============================================================
 * 函数：清理 dist 文件夹
 * ============================================================
 * 在构建前删除 dist 文件夹，确保干净的构建环境。
 */
async function cleanDistFolder(): Promise<void> {
  console.log('='.repeat(50));
  console.log('清理 dist 文件夹...');
  
  if (fs.existsSync(DIST_PATH)) {
    try {
      // 使用 Git Bash rm -rf 命令删除，避免 Windows 文件锁问题
      await runGitBashCommand(`rm -rf ${UNIAPP_PROJECT_PATH}/dist`);
      console.log('[成功] dist 文件夹已删除');
    } catch (error) {
      console.warn('[警告] 删除 dist 文件夹失败，将继续执行');
    }
  } else {
    console.log('[提示] dist 文件夹不存在，跳过清理');
  }
  
  console.log('='.repeat(50));
}


/**
 * ============================================================
 * 函数：重命名 h5 文件夹
 * ============================================================
 * 构建完成后将 h5 文件夹重命名为 gwwy-uniapp。
 */
async function renameH5Folder(): Promise<void> {
  console.log('='.repeat(50));
  console.log('重命名 h5 文件夹...');
  
  if (!fs.existsSync(H5_PATH)) {
    throw new Error(`h5 文件夹不存在: ${H5_PATH}`);
  }
  
  // 如果目标文件夹已存在，先删除
  if (fs.existsSync(RENAMED_PATH)) {
    fs.rmSync(RENAMED_PATH, { recursive: true, force: true });
    console.log('[提示] 已删除旧的 gwwy-uniapp 文件夹');
  }
  
  fs.renameSync(H5_PATH, RENAMED_PATH);
  console.log(`[成功] 已将 h5 重命名为 gwwy-uniapp`);
  
  console.log('='.repeat(50));
}


/**
 * ============================================================
 * 函数：执行压缩
 * ============================================================
 * 使用 CompressService 压缩构建产物。
 */
async function compressBuild(): Promise<void> {
  console.log('='.repeat(50));
  console.log('开始压缩构建产物...');
  
  if (!fs.existsSync(SOURCE_PATH)) {
    throw new Error(`源文件夹不存在: ${SOURCE_PATH}`);
  }
  
  const compressService = new CompressService();
  
  const result = await compressService.compress(
    SOURCE_PATH,
    OUTPUT_ZIP,
    {
      level: 2,        // 正常压缩
      format: 'zip',   // ZIP格式
      recursive: true, // 递归子目录
      storeRoot: true, // 存储根目录
      threads: 0,      // 自动线程数
    }
  );
  
  console.log(`[成功] 压缩完成: ${result.archivePath}`);
  console.log(`[信息] 文件大小: ${(result.size / 1024 / 1024).toFixed(2)} MB`);
  
  console.log('='.repeat(50));
}


/**
 * ============================================================
 * 主函数：演示完整的构建、压缩、解压流程
 * ============================================================
 */
async function main(): Promise<void> {
  console.log('\n### 开始执行示例 ###\n');
  
  try {
    // 1. 清理 dist 文件夹
    await cleanDistFolder();
    
    // 2. 检查并切换到目标分支
    await checkAndSwitchBranch();
    
    // 3. 拉取最新代码
    await pullLatestCode();
    
    // 4. 执行构建
    await runBuild();
    
    // 5. 重命名 h5 文件夹
    await renameH5Folder();
    
    // 6. 压缩构建产物
    await compressBuild();
    
    console.log('\n### 所有步骤执行完成！ ###\n');
    
  } catch (error) {
    // 捕获并打印所有错误
    console.error('\n[执行失败]');
    if (error instanceof Error) {
      console.error(`错误信息: ${error.message}`);
    }
    console.error('请检查命令是否正确，以及文件路径是否存在。\n');
  }
}

// === 执行主函数 ===
// 这是脚本的入口点
main();
