# Renderの推奨するNode.jsのベースイメージを使用（Debianベース）
FROM node:20-slim

# 環境の更新と、Puppeteerの実行に必要な依存関係と日本語フォントをインストール
RUN apt-get update && \
    apt-get install -yq --no-install-recommends \
        chromium \
        # Chromium実行に必要な依存関係
        libnss3 \
        libgbm-dev \
        libasound2 \
        # 日本語フォント (文字化け対策)
        fonts-noto-cjk \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get clean

# PuppeteerがChromeを見つけられるように環境変数を設定（任意、推奨）
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# アプリケーションのセットアップ
WORKDIR /usr/src/app
COPY package*.json ./
# npm ciで依存関係をインストール
RUN npm ci

# アプリケーションコードをコピー
COPY . .

# サービス起動コマンドを設定 (RenderのWeb Serviceで設定するコマンドと同じ)
# 例: CMD ["node", "server.js"] や CMD ["npm", "start"] など、あなたのアプリの起動方法に合わせて変更してください
CMD ["npm", "start"]