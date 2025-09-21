// .puppeteerrc.cjs  ＊package.json と同じ階層
/**
 * @type {import('puppeteer').Configuration}
 */

let path;
if (process.env.NODE_ENV !== 'production') {
    path = undefined;
    return;
} else {
    path = '/opt/render/project/.cache/puppeteer';
}
module.exports = {
//   ここへ必ず入れる
  cacheDirectory: path,
//   念のため Chrome のダウンロードを明示
  chrome: { skipDownload: false },
};