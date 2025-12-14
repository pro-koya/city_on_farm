// services/logger.js
const winston = require('winston');
const path = require('path');

const isProd = process.env.NODE_ENV === 'production';

// ログレベルの設定
const logLevel = isProd ? 'error' : 'debug';

// ログフォーマット
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;

    // メタデータがある場合は追加
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }

    // スタックトレースがある場合は追加
    if (stack) {
      log += `\n${stack}`;
    }

    return log;
  })
);

// トランスポート設定
const transports = [
  // コンソール出力（開発環境のみ）
  new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      logFormat
    ),
    silent: isProd  // 本番環境ではコンソール出力を無効化
  }),

  // エラーログファイル
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/error.log'),
    level: 'error',
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  }),

  // 全ログファイル
  new winston.transports.File({
    filename: path.join(__dirname, '../logs/combined.log'),
    format: logFormat,
    maxsize: 5242880, // 5MB
    maxFiles: 5
  })
];

// ロガーの作成
const logger = winston.createLogger({
  level: logLevel,
  transports,
  // 未処理の例外・Promiseリジェクションをキャッチ
  exceptionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/exceptions.log'),
      format: logFormat
    })
  ],
  rejectionHandlers: [
    new winston.transports.File({
      filename: path.join(__dirname, '../logs/rejections.log'),
      format: logFormat
    })
  ]
});

// セキュリティ上機密情報をログに含めないヘルパー関数
logger.sanitize = (data) => {
  if (!data) return data;

  const sensitiveFields = ['password', 'password_hash', 'token', 'secret', 'api_key', 'access_key', 'private_key'];
  const sanitized = { ...data };

  for (const field of sensitiveFields) {
    if (sanitized[field]) {
      sanitized[field] = '[REDACTED]';
    }
  }

  return sanitized;
};

module.exports = logger;
