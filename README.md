### 使用方法如下

####
npm install pino-rotate-file
yarn add pino-rotate-file

```js
import pino from 'pino';
import { rotate } from 'pino-rotate-file';

rotate({
  maxAgeDays: 1, // 按照1天的作为分割，分别存储目录
  path: `./logs/${appName}`, // 日志文件存储目录，绝对路径和相对路径都支持
  mkdir: true, // 当目录不存在时，是否直接创建目录
}).then((transfer) => {
  const logger = pino({level: 'info'}, transfer);

  logger.info('hello, pino!')
})
```
