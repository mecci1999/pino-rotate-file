import moment from "moment-timezone";
import { readdir, unlink, access, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { once } from "events";
import { constants as fsConstants } from "fs";
import build from "pino-abstract-transport";
import { SonicBoom } from "sonic-boom";
import { prettyFactory } from "pino-pretty";
import type { PrettyOptions } from "pino-pretty";

export type PinoRotateFileOptions = {
  path: string; // 文件存储路径
  maxSize?: string; // 单个文件最大文件大小，单位M
  maxAgeDays?: number; // 日志分割时间
  mkdir?: boolean; // 是否创建目录
  prettyOptions?: PrettyOptions;
};

const ONE_DAY = 24 * 60 * 60 * 1_000;
const DEFAULT_MAX_AGE_DAYS = 1;

/**
 * 根据传入的path路径，转换为绝对路径
 */
function covertRelativePath(path: string) {
  // 判断是否为相对路径
  if (path.includes("./")) {
    // 将相对路径转换为绝对路径
    return resolve(path);
  }

  return path;
}

/**
 * 创建文件名
 */
function createFileName(): string {
  const chinaTime = moment().tz("Asia/Shanghai").format("YYYY_MM_DD");

  // 根据当前时间输出对应的日志文件名
  return `${chinaTime}.log`;
}

/**
 * 根据配置项停止对日志的写入
 */
async function cleanup(path: string, maxAgeDays: number): Promise<void> {
  path = covertRelativePath(path);

  // 根据路径获取目录下的文件名
  const files = await readdir(path);
  const promises: Promise<void>[] = [];

  for (const file of files) {
    if (!file.endsWith(".log")) {
      // 排除掉非日志文件
      continue;
    }
    const dayString = file.split(".")[0];
    const date = new Date(dayString.split("_").join("-")).getTime();
    const now = Date.now();

    if (now - date >= maxAgeDays * ONE_DAY) {
      // 停止再次对该日志的文件的写入
      promises.push(unlink(join(path, file)));
    }
  }

  await Promise.all(promises);
}

/**
 * 根据路径开始写入日志
 */
async function createDest(path: string) {
  path = covertRelativePath(path);

  // 创建写入流
  const stream = new SonicBoom({ dest: path });
  await once(stream, "ready");

  return {
    path,
    stream,
  };
}

/**
 * 结束日志的写入流
 */
async function endStream(stream: SonicBoom) {
  stream.end();

  await once(stream, "close");
}

/**
 * 创建日志写入流
 */
async function rotate(options: PinoRotateFileOptions) {
  const pretty = options.prettyOptions
    ? prettyFactory(options.prettyOptions)
    : null;

  const path = covertRelativePath(options.path);
  if (options.mkdir) {
    try {
      await access(path, fsConstants.F_OK);
    } catch (error) {
      await mkdir(path, { recursive: true });
    }
  }

  await access(path, fsConstants.R_OK | fsConstants.W_OK);

  await cleanup(path, options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS);

  let dest = await createDest(join(path, createFileName()));

  return build(
    async (source) => {
      for await (const payload of source) {
        const logPath = join(path, createFileName());
        if (dest.path !== logPath) {
          // 写入的日志文件需要切换，停止之前的写入流
          await cleanup(path, options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS);
          await endStream(dest.stream);
          // 创建新的写入流
          dest = await createDest(logPath);
        }

        const text = pretty ? pretty(payload) : `${JSON.stringify(payload)}\n`;
        const toDrain = !dest.stream.write(text);
        if (toDrain) {
          await once(dest.stream, "drain");
        }
      }
    },
    {
      close: async () => {
        await cleanup(path, options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS);
        await endStream(dest.stream);
      },
    }
  );
}

export { createFileName, cleanup, createDest, endStream, rotate };
