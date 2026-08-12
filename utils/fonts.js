// utils/fonts.js —— 字体加载脚手架（图标字体）
//
// 设计意图（见 DESIGN_SYSTEM.md §6 / P2「字体」）：
//   1. 等宽数字字体 SNDNum 已由 app.wxss @import styles/fonts.wxss 以「包内 base64
//      @font-face」提供（2026-08-08 由本文件网络加载改版，原因见下），本文件不再加载。
//   2. 「图标字体」为可选增强：团队把 iconfont.cn 项目导出的 .ttf 托管到自有 CDN 后，
//      填入 ICONFONT_URL 即可将九宫格 emoji 图标替换为统一图标字体。
//      替换路径与命名约定见 DESIGN_SYSTEM.md §6 / P2。
//   3. 所有加载均 try/catch 守护，失败或被网络白名单拦截时「静默回退系统字体」，
//      绝不阻塞首屏，也不抛未捕获异常（适合现场弱网/离线场景）。
//
// 字体族名约定：
//   - SNDNum ：等宽数字（仪表盘、Hero），wxss 中通过 --font-num 令牌引用，回退系统等宽栈。
//   - SNDIcon：图标字体（可选），wxss 中通过 .iconfont 类引用，回退系统字体。
//
// 为什么 SNDNum 弃用 wx.loadFontFace 网络加载（2026-08-08，BUGLOG log1.txt）：
//   1. 原 URL 指向 cdn.jsdelivr.net，国内网络 DNS 解析失败（getaddrinfo ENOTFOUND），
//      线上每次启动必失败回退，等宽数字从未生效；
//   2. loadFontFace 不支持包内本地路径；Data URL 需基础库 >= 3.7.9，项目 libVersion 3.0.0 不满足；
//   3. 网络字体还必须在小程序后台配置 downloadFile 合法域名；
//   4. base64 @font-face 免白名单、离线可用，符合「现场弱网/离线」设计意图。
//   5. 字体为 roboto-mono latin 子集 woff（15.8KB，base64 21KB），主包体积代价可接受。

// 图标字体：留空表示「暂不加载」，九宫格继续用 emoji 图标。
// 接入步骤：1) 在 iconfont.cn 建项目并添加所需图标；2) 下载 .ttf 托管到自有 CDN；
//          3) 把下面地址替换为该 .ttf URL（如 https://your-cdn.example.com/snd-iconfont.ttf）；
//          4) 在 wxml 中将 emoji 文本改为 <text class="iconfont">&#xe001;</text> 之类。
const ICONFONT_URL = '';

// v4（2026-08-12）：已用 remixicon 子集化生成轻量图标字体 assets/fonts/snd-icon.ttf（52 图标 / 9.1KB）。
// 二选一：A. ICONFONT_URL（CDN 直链）/ B. ICONFONT_FILEID（云存储，运行期 getTempFileURL 再加载）
// 映射：assets/fonts/snd-icon-map.json（类名/场景/Unicode）、assets/fonts/snd-icons.wxss（图标类）
const ICONFONT_FILEID = 'cloud://cloud1-d0g31jich6a6569b0.636c-cloud1-d0g31jich6a6569b0-1449954076/ICON/snd-icon.ttf';

// 单次加载：成功/失败都 resolve（失败返回 false），不让未捕获 reject 冒泡到 onLaunch。
function loadOne(family, url) {
  return new Promise((resolve) => {
    if (!url) { resolve(false); return; }
    wx.loadFontFace({
      family,
      source: 'url("' + url + '")',
      scopes: ['webview', 'native'],
      success: () => resolve(true),
      fail: (err) => {
        console.warn('[fonts] 加载失败，回退系统字体：', family, err);
        resolve(false);
      },
    });
  });
}

// 图标字体：优先云存储 fileID（getTempFileURL → loadFontFace），失败静默回退。
async function loadSNDIcon() {
  if (ICONFONT_FILEID) {
    try {
      const { fileList } = await wx.cloud.getTempFileURL({ fileList: [ICONFONT_FILEID] });
      const url = fileList && fileList[0] && fileList[0].tempFileURL;
      if (!url) return false;
      return await loadOne('SNDIcon', url);
    } catch (e) {
      console.warn('[fonts] 图标字体云存储加载失败，回退 emoji：', e);
      return false;
    }
  }
  return loadOne('SNDIcon', ICONFONT_URL);
}

// 并发加载所有可选字体；整体异常也吞掉，绝不影响首屏。
function loadFonts() {
  return loadSNDIcon()
    .then(() => [])
    .catch(() => []);
}

module.exports = { loadFonts, ICONFONT_URL, ICONFONT_FILEID };
