const { withAndroidManifest } = require('expo/config-plugins');

/**
 * Lets the main activity float as picture-in-picture during calls (modules/flock-pip), and keeps it
 * from restarting when the window shrinks and grows again.
 */
module.exports = function withAndroidPip(config) {
  return withAndroidManifest(config, (next) => {
    const app = next.modResults.manifest.application?.[0];
    const main = app?.activity?.find((a) => a.$['android:name'] === '.MainActivity');
    if (!main) throw new Error('with-android-pip: MainActivity not found in the manifest');
    main.$['android:supportsPictureInPicture'] = 'true';
    main.$['android:resizeableActivity'] = 'true';
    const changes = new Set((main.$['android:configChanges'] || '').split('|').filter(Boolean));
    for (const c of ['screenSize', 'smallestScreenSize', 'screenLayout', 'orientation']) changes.add(c);
    main.$['android:configChanges'] = [...changes].join('|');
    return next;
  });
};
