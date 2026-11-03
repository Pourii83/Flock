const { withMainApplication } = require('expo/config-plugins');

/** Enables react-native-webrtc's foreground MediaProjection service on Android 14+. */
module.exports = function withWebRtcScreenShare(config) {
  return withMainApplication(config, (next) => {
    let source = next.modResults.contents;
    const importLine = 'import com.oney.WebRTCModule.WebRTCModuleOptions';
    if (!source.includes(importLine)) {
      source = source.replace('import android.content.res.Configuration', `import android.content.res.Configuration\n\n${importLine}`);
    }
    const enableLine = 'WebRTCModuleOptions.getInstance().enableMediaProjectionService = true';
    if (!source.includes(enableLine)) {
      source = source.replace('    super.onCreate()', `    super.onCreate()\n    ${enableLine}`);
    }
    next.modResults.contents = source;
    return next;
  });
};

